use std::{
    fs,
    io::{BufRead, BufReader, Write},
    net::TcpStream,
    path::PathBuf,
    process::{Child, Command, Stdio},
    sync::{Arc, Mutex},
    thread,
    time::{Duration, Instant},
};

use tauri::{AppHandle, Manager, State, WebviewWindow, WindowEvent};

#[derive(Default)]
struct ServerRuntime {
    child: Option<Child>,
    port: Option<u16>,
    data_dir: Option<PathBuf>,
}

#[derive(Default)]
struct ServerState(Mutex<ServerRuntime>);

#[tauri::command]
fn get_server_port(state: State<'_, ServerState>) -> Option<u16> {
    state.0.lock().ok().and_then(|runtime| runtime.port)
}

#[tauri::command]
fn get_data_dir(app: AppHandle) -> Result<String, String> {
    resolve_data_dir(&app).map(|path| path.to_string_lossy().into_owned())
}

#[tauri::command]
fn restart_server(app: AppHandle) -> Result<u16, String> {
    start_next_server(&app)
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_process::init())
        .manage(ServerState::default())
        .invoke_handler(tauri::generate_handler![
            get_server_port,
            get_data_dir,
            restart_server
        ])
        .setup(|app| {
            if let Some(window) = app.get_webview_window("main") {
                let app_handle = app.handle().clone();
                let close_handle = app.handle().clone();

                window.on_window_event(move |event| {
                    if matches!(event, WindowEvent::CloseRequested { .. }) {
                        stop_next_server(&close_handle);
                    }
                });

                #[cfg(not(debug_assertions))]
                thread::spawn(move || match start_next_server(&app_handle) {
                    Ok(port) => {
                        let url = format!("http://localhost:{port}");
                        if let Err(error) = window.navigate(url.parse().expect("valid localhost URL")) {
                            show_error_page(&window, &format!("加载桌面服务失败：{error}"));
                        }
                    }
                    Err(error) => show_error_page(&window, &error),
                });
            }

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running OSE desktop app");
}

fn start_next_server(app: &AppHandle) -> Result<u16, String> {
    stop_next_server(app);

    let data_dir = resolve_data_dir(app)?;
    fs::create_dir_all(&data_dir).map_err(|error| format!("创建数据目录失败：{error}"))?;

    let standalone_dir = resolve_standalone_dir(app)?;
    let start_script = standalone_dir.join("start.js");
    if !start_script.exists() {
        return Err(format!(
            "未找到 Next.js standalone 启动脚本：{}。请先运行 npm run tauri:prepare。",
            start_script.display()
        ));
    }

    let port = pick_port()?;
    let database_url = format!("file:{}", data_dir.join("ose.db").to_string_lossy());

    let mut child = Command::new("node")
        .arg(&start_script)
        .current_dir(&standalone_dir)
        .env("PORT", port.to_string())
        .env("HOSTNAME", "localhost")
        .env("DATABASE_URL", database_url)
        .env("AUTH_URL", format!("http://localhost:{port}"))
        .env("NEXTAUTH_URL", format!("http://localhost:{port}"))
        .env("NODE_ENV", "production")
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|error| format!("启动 Node.js 失败：{error}。请确认已安装 Node.js 20+ 并加入 PATH。"))?;

    pipe_process_output(child.stdout.take(), "next:stdout");
    pipe_process_output(child.stderr.take(), "next:stderr");

    {
        let state = app.state::<ServerState>();
        let mut runtime = state
            .0
            .lock()
            .map_err(|_| "服务器状态锁定失败".to_string())?;
        runtime.child = Some(child);
        runtime.port = Some(port);
        runtime.data_dir = Some(data_dir);
    }

    if wait_until_ready(port, Duration::from_secs(15)) {
        Ok(port)
    } else {
        stop_next_server(app);
        Err("服务器启动超时，请检查 Node.js、Prisma 或端口占用状态。".to_string())
    }
}

fn stop_next_server(app: &AppHandle) {
    let state = app.state::<ServerState>();
    let Ok(mut runtime) = state.0.lock() else {
        return;
    };

    if let Some(mut child) = runtime.child.take() {
        let _ = child.kill();
        let _ = child.wait();
    }
    runtime.port = None;
}

fn resolve_data_dir(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map_err(|error| format!("获取用户数据目录失败：{error}"))
}

fn resolve_standalone_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let resource_dir = app.path().resource_dir().ok();
    let bundled = resource_dir
        .as_ref()
        .map(|path| path.join("binaries").join("standalone"));

    if let Some(path) = bundled.filter(|path| path.exists()) {
        return Ok(path);
    }

    std::env::current_dir()
        .map(|path| path.join("binaries").join("standalone"))
        .map_err(|error| format!("获取 standalone 目录失败：{error}"))
}

fn pick_port() -> Result<u16, String> {
    for _ in 0..10 {
        if let Some(port) = portpicker::pick_unused_port() {
            return Ok(port);
        }
    }
    Err("无法找到可用端口".to_string())
}

fn wait_until_ready(port: u16, timeout: Duration) -> bool {
    let started = Instant::now();
    while started.elapsed() < timeout {
        if health_check(port) {
            return true;
        }
        thread::sleep(Duration::from_millis(300));
    }
    false
}

fn health_check(port: u16) -> bool {
    let Ok(mut stream) = TcpStream::connect(("127.0.0.1", port)) else {
        return false;
    };
    let _ = stream.set_read_timeout(Some(Duration::from_secs(2)));
    let request = "GET /api/ai/status HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\n\r\n";
    if stream.write_all(request.as_bytes()).is_err() {
        return false;
    }

    let mut first_line = String::new();
    BufReader::new(stream).read_line(&mut first_line).is_ok() && first_line.contains("200")
}

fn pipe_process_output<T>(pipe: Option<T>, label: &'static str)
where
    T: std::io::Read + Send + 'static,
{
    if let Some(pipe) = pipe {
        let ready_seen = Arc::new(Mutex::new(false));
        let ready_seen_for_thread = Arc::clone(&ready_seen);
        thread::spawn(move || {
            for line in BufReader::new(pipe).lines().map_while(Result::ok) {
                if line.contains("Ready on") || line.contains("started server") {
                    if let Ok(mut seen) = ready_seen_for_thread.lock() {
                        *seen = true;
                    }
                }
                println!("[{label}] {line}");
            }
        });
    }
}

fn show_error_page(window: &WebviewWindow, message: &str) {
    let escaped = message
        .replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
        .replace('`', "&#96;");
    let script = format!(
        "document.body.innerHTML = `<main style=\"font-family: system-ui; padding: 40px; line-height: 1.7\"><h1>OSE 桌面服务启动失败</h1><p>{escaped}</p></main>`;"
    );
    let _ = window.eval(&script);
}
