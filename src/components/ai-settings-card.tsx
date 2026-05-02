'use client';

import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import Image from 'next/image';
import { CheckCircle2, Eye, ImageIcon, Loader2, RefreshCw, Save, Trash2, Zap } from 'lucide-react';

import { useAIStatus } from '@/components/ai-status-context';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { OSESelect } from '@/components/ose-select';
import {
  AI_IMAGE_OUTPUT_FORMAT_OPTIONS,
  AI_IMAGE_QUALITY_OPTIONS,
  AI_IMAGE_SIZE_OPTIONS,
  AI_IMAGE_STYLE_OPTIONS,
} from '@/lib/ai/image-types';

type Settings = {
  provider: string | null;
  model: string | null;
  baseUrl: string | null;
  apiKeyMasked: string | null;
  hasApiKey: boolean;
  visionSupport: boolean | null;
  imageProvider: string | null;
  imageModel: string | null;
  imageBaseUrl: string | null;
  imageApiKeyMasked: string | null;
  hasImageApiKey: boolean;
  imageSize: string | null;
  imageQuality: string | null;
  imageOutputFormat: string | null;
  imageStyle: string | null;
  imageRateLimitPerMinute: number | null;
  imageRateLimitHourly: number | null;
  imageRateLimitDaily: number | null;
};

type TestResult = {
  provider: string;
  model: string;
  latencyMs: number;
  output: string;
};

const DEFAULT_SETTINGS: Settings = {
  provider: null,
  model: null,
  baseUrl: null,
  apiKeyMasked: null,
  hasApiKey: false,
  visionSupport: null,
  imageProvider: null,
  imageModel: null,
  imageBaseUrl: null,
  imageApiKeyMasked: null,
  hasImageApiKey: false,
  imageSize: null,
  imageQuality: null,
  imageOutputFormat: null,
  imageStyle: null,
  imageRateLimitPerMinute: null,
  imageRateLimitHourly: null,
  imageRateLimitDaily: null,
};

const DEFAULT_IMAGE_RATE_LIMIT_PER_MINUTE = 10;
const DEFAULT_IMAGE_RATE_LIMIT_HOURLY = 60;
const DEFAULT_IMAGE_RATE_LIMIT_DAILY = 300;

const PROVIDERS = [
  { value: '', label: '使用服务器环境变量' },
  { value: 'openai', label: 'OpenAI' },
  { value: 'claude', label: 'Claude' },
  { value: 'gemini', label: 'Gemini' },
  { value: 'custom', label: '自定义（OpenAI 兼容）' },
];

const IMAGE_PROVIDERS = [
  { value: '', label: '使用服务器环境变量' },
  { value: 'openai', label: 'OpenAI' },
  { value: 'custom', label: '自定义（OpenAI 兼容）' },
];

export function AISettingsCard() {
  const status = useAIStatus();
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [apiKeyDraft, setApiKeyDraft] = useState('');
  const [imageApiKeyDraft, setImageApiKeyDraft] = useState('');
  const [models, setModels] = useState<string[]>([]);
  const [imageModels, setImageModels] = useState<string[]>([]);
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [testResult, setTestResult] = useState<TestResult | null>(null);
  const [imageTestResult, setImageTestResult] = useState<TestResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadingModels, setLoadingModels] = useState(false);
  const [loadingImageModels, setLoadingImageModels] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testingImage, setTestingImage] = useState(false);
  const [testingVision, setTestingVision] = useState(false);

  const busy = loading || saving || loadingModels || loadingImageModels || testing || testingImage || testingVision;
  const selectedImageStyle =
    AI_IMAGE_STYLE_OPTIONS.find(
      (option) => option.value === (settings.imageStyle || 'clean_education_card')
    ) ?? AI_IMAGE_STYLE_OPTIONS[0];

  const requestPayload = useMemo(() => {
    const payload: Record<string, unknown> = {
      provider: settings.provider || '',
      model: settings.model || '',
      baseUrl: settings.baseUrl || '',
      imageProvider: settings.imageProvider || '',
      imageModel: settings.imageModel || '',
      imageBaseUrl: settings.imageBaseUrl || '',
      imageSize: settings.imageSize || '1024x1536',
      imageQuality: settings.imageQuality || 'medium',
      imageOutputFormat: settings.imageOutputFormat || 'webp',
      imageStyle: settings.imageStyle || 'clean_education_card',
      imageRateLimitPerMinute:
        settings.imageRateLimitPerMinute ?? DEFAULT_IMAGE_RATE_LIMIT_PER_MINUTE,
      imageRateLimitHourly: settings.imageRateLimitHourly ?? DEFAULT_IMAGE_RATE_LIMIT_HOURLY,
      imageRateLimitDaily: settings.imageRateLimitDaily ?? DEFAULT_IMAGE_RATE_LIMIT_DAILY,
    };
    if (apiKeyDraft.trim()) payload.apiKey = apiKeyDraft.trim();
    if (imageApiKeyDraft.trim()) payload.imageApiKey = imageApiKeyDraft.trim();
    return payload;
  }, [
    apiKeyDraft,
    imageApiKeyDraft,
    settings.baseUrl,
    settings.imageBaseUrl,
    settings.imageModel,
    settings.imageOutputFormat,
    settings.imageProvider,
    settings.imageQuality,
    settings.imageRateLimitDaily,
    settings.imageRateLimitHourly,
    settings.imageRateLimitPerMinute,
    settings.imageSize,
    settings.imageStyle,
    settings.model,
    settings.provider,
  ]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/profile/ai-settings', { cache: 'no-store' });
      if (!response.ok) return;
      const data = (await response.json()) as Settings;
      setSettings(data);
      setApiKeyDraft('');
      setImageApiKeyDraft('');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    setModels([]);
    setTestResult(null);
  }, [settings.provider, settings.baseUrl]);


  useEffect(() => {
    setImageModels([]);
    setImageTestResult(null);
  }, [settings.imageProvider, settings.imageBaseUrl]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setMessage(null);
    try {
      const response = await fetch('/api/profile/ai-settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestPayload),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setMessage({ kind: 'error', text: (data as { message?: string }).message || '保存失败' });
        return;
      }
      setMessage({ kind: 'ok', text: '已保存' });
      await load();
      await status.refresh();
    } catch {
      setMessage({ kind: 'error', text: '网络异常，请稍后再试' });
    } finally {
      setSaving(false);
    }
  }

  async function fetchModels() {
    setLoadingModels(true);
    setMessage(null);
    setTestResult(null);
    try {
      const response = await fetch('/api/profile/ai-settings/models', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestPayload),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setMessage({
          kind: 'error',
          text: (data as { message?: string }).message || '模型列表获取失败',
        });
        return;
      }
      const nextModels = ((data as { models?: string[] }).models ?? []).filter(Boolean);
      setModels(nextModels);
      setMessage({
        kind: 'ok',
        text: nextModels.length
          ? `已获取 ${nextModels.length} 个模型`
          : '没有获取到可用模型，请手动填写模型名称',
      });
    } catch {
      setMessage({ kind: 'error', text: '模型列表获取失败，请检查网络或 Base URL' });
    } finally {
      setLoadingModels(false);
    }
  }

  async function fetchImageModels() {
    setLoadingImageModels(true);
    setMessage(null);
    try {
      const response = await fetch('/api/profile/ai-settings/image-models', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestPayload),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setMessage({
          kind: 'error',
          text: (data as { message?: string }).message || '生图模型列表获取失败',
        });
        return;
      }
      const nextModels = ((data as { models?: string[] }).models ?? []).filter(Boolean);
      setImageModels(nextModels);
      setMessage({
        kind: 'ok',
        text: nextModels.length
          ? `已获取 ${nextModels.length} 个生图模型`
          : '没有获取到可用生图模型，请手动填写模型名称',
      });
    } catch {
      setMessage({ kind: 'error', text: '生图模型列表获取失败，请检查网络或 Base URL' });
    } finally {
      setLoadingImageModels(false);
    }
  }

  async function testConnection() {
    setTesting(true);
    setMessage(null);
    setTestResult(null);
    try {
      const response = await fetch('/api/profile/ai-settings/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestPayload),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setMessage({
          kind: 'error',
          text: (data as { message?: string }).message || '模型测试失败',
        });
        return;
      }
      setTestResult(data as TestResult);
      setMessage({ kind: 'ok', text: '模型测试通过' });
    } catch {
      setMessage({ kind: 'error', text: '模型测试失败，请检查网络、API Key 或模型名称' });
    } finally {
      setTesting(false);
    }
  }

  async function testImageConnection() {
    setTestingImage(true);
    setMessage(null);
    setImageTestResult(null);
    try {
      const response = await fetch('/api/profile/ai-settings/image-test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestPayload),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setMessage({
          kind: 'error',
          text: (data as { message?: string }).message || '生图模型测试失败',
        });
        return;
      }
      setImageTestResult(data as TestResult);
      setMessage({ kind: 'ok', text: '生图模型测试通过' });
    } catch {
      setMessage({ kind: 'error', text: '生图模型测试失败，请检查网络、API Key 或模型名称' });
    } finally {
      setTestingImage(false);
    }
  }

  async function testVisionCapability() {
    setTestingVision(true);
    setMessage(null);
    try {
      const response = await fetch('/api/profile/ai-settings/vision-test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestPayload),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setMessage({
          kind: 'error',
          text: (data as { message?: string }).message || '视觉能力测试失败',
        });
        return;
      }
      const result = data as { supportsVision: boolean; latencyMs: number };
      setSettings((prev) => ({ ...prev, visionSupport: result.supportsVision }));
      setMessage({
        kind: result.supportsVision ? 'ok' : 'error',
        text: result.supportsVision
          ? `视觉能力测试通过（${result.latencyMs}ms），该模型支持图像输入`
          : `视觉能力测试未通过（${result.latencyMs}ms），该模型不支持图像输入`,
      });
    } catch {
      setMessage({ kind: 'error', text: '视觉能力测试失败，请检查网络、API Key 或模型名称' });
    } finally {
      setTestingVision(false);
    }
  }

  async function clearConfig() {
    if (!confirm('确认清空个人 AI 配置并回落到服务器环境变量？')) return;
    setSaving(true);
    try {
      const response = await fetch('/api/profile/ai-settings', { method: 'DELETE' });
      if (!response.ok) {
        setMessage({ kind: 'error', text: '清空失败' });
        return;
      }
      setMessage({ kind: 'ok', text: '已清空个人配置' });
      setSettings(DEFAULT_SETTINGS);
      setApiKeyDraft('');
      setImageApiKeyDraft('');
      setModels([]);
      setImageModels([]);
      setTestResult(null);
      setImageTestResult(null);
      await status.refresh();
    } finally {
      setSaving(false);
    }
  }

  async function clearApiKey() {
    setSaving(true);
    try {
      const response = await fetch('/api/profile/ai-settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...requestPayload, apiKey: null, imageApiKey: undefined }),
      });
      if (!response.ok) return;
      await load();
      await status.refresh();
      setMessage({ kind: 'ok', text: '已清空 API Key' });
    } finally {
      setSaving(false);
    }
  }

  async function clearImageApiKey() {
    setSaving(true);
    try {
      const response = await fetch('/api/profile/ai-settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...requestPayload, apiKey: undefined, imageApiKey: null }),
      });
      if (!response.ok) return;
      await load();
      setMessage({ kind: 'ok', text: '已清空生图 API Key' });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="p-6 hover:translate-y-0">
      <p className="text-sm font-black text-primary">AI 设置</p>
      <h2 className="mt-2 text-2xl font-black text-navy">智能辅助功能</h2>
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <div className="rounded-3xl bg-softBlue p-4">
          <p className="font-black text-muted">当前供应商</p>
          <p className="mt-2 text-2xl font-black text-navy">{status.provider ?? '未配置'}</p>
        </div>
        <div className="rounded-3xl bg-softGreen p-4">
          <p className="font-black text-muted">当前模型</p>
          <p className="mt-2 text-lg font-black text-navy">{status.model ?? '未配置'}</p>
        </div>
        <div className="rounded-3xl bg-softYellow p-4">
          <p className="font-black text-muted">配置来源</p>
          <p className="mt-2 text-lg font-black text-navy">
            {status.source === 'user'
              ? '个人配置'
              : status.source === 'env'
                ? '服务器环境变量'
                : '未配置'}
          </p>
        </div>
      </div>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <div className="rounded-3xl bg-softRose p-4">
          <p className="font-black text-muted">当前 Endpoint</p>
          <p className="mt-2 break-all font-bold text-navy">{status.endpoint ?? '未配置'}</p>
        </div>
        <div className="rounded-3xl bg-white/70 p-4">
          <p className="font-black text-muted">视觉能力</p>
          <div className="mt-2 flex items-center gap-2">
            {settings.visionSupport === true ? (
              <span className="inline-flex items-center rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-bold text-green-800">支持视觉</span>
            ) : settings.visionSupport === false ? (
              <span className="inline-flex items-center rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-bold text-red-700">不支持视觉</span>
            ) : (
              <span className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-bold text-gray-600">未检测</span>
            )}
          </div>
        </div>
      </div>

      <form onSubmit={onSubmit} className="mt-6 space-y-4">
        <div className="rounded-3xl bg-white/70 p-4">
          <p className="text-sm font-black text-muted">文本 AI</p>
          <p className="mt-1 text-sm font-bold text-muted">
            用于聊天、讲解，以及生成讲解图的结构化提示词。
          </p>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="ai-provider">供应商</Label>
            <OSESelect
              value={settings.provider ?? ''}
              options={PROVIDERS}
              disabled={busy}
              onChange={(provider) =>
                setSettings((prev) => ({ ...prev, provider: provider || null, visionSupport: null }))
              }
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="ai-model">模型名称</Label>
            <div className="flex gap-2">
              <Input
                id="ai-model"
                list="ai-model-options"
                value={settings.model ?? ''}
                onChange={(event) =>
                  setSettings((prev) => ({ ...prev, model: event.target.value, visionSupport: null }))
                }
                placeholder="留空使用默认值，例如 gpt-4o-mini"
                disabled={busy}
                maxLength={200}
              />
              <Button
                type="button"
                variant="secondary"
                onClick={fetchModels}
                disabled={busy}
                title="从供应商获取模型列表"
              >
                {loadingModels ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4" />
                )}
                获取
              </Button>
            </div>
            <datalist id="ai-model-options">
              {models.map((model) => (
                <option key={model} value={model} />
              ))}
            </datalist>
            {models.length ? (
              <p className="text-xs font-bold text-muted">可从输入框候选中选择，或继续手动输入。</p>
            ) : null}
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="ai-base-url">Base URL（代理或 custom 时填写）</Label>
            <Input
              id="ai-base-url"
              value={settings.baseUrl ?? ''}
              onChange={(event) =>
                setSettings((prev) => ({ ...prev, baseUrl: event.target.value }))
              }
              placeholder="https://your-proxy.example.com/v1"
              disabled={busy}
              maxLength={500}
            />
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="ai-api-key">
              API Key{' '}
              {settings.hasApiKey ? (
                <span className="ml-2 text-xs font-bold text-muted">
                  已保存：{settings.apiKeyMasked}
                </span>
              ) : null}
            </Label>
            <div className="flex gap-2">
              <Input
                id="ai-api-key"
                value={apiKeyDraft}
                onChange={(event) => setApiKeyDraft(event.target.value)}
                placeholder={settings.hasApiKey ? '留空即保持现有 API Key' : '粘贴你的 API Key'}
                disabled={busy}
                type="password"
                maxLength={500}
                autoComplete="off"
              />
              {settings.hasApiKey ? (
                <Button type="button" variant="secondary" onClick={clearApiKey} disabled={busy}>
                  清空 Key
                </Button>
              ) : null}
            </div>
            <p className="text-xs font-bold text-muted">
              API Key 会明文保存到本地数据库，仅你自己可见。若不想持久化，请改用服务器环境变量。
            </p>
          </div>
        </div>

        <div className="rounded-3xl bg-white/70 p-4">
          <p className="text-sm font-black text-muted">错题讲解图</p>
          <p className="mt-1 text-sm font-bold text-muted">
            使用独立生图供应商生成视觉元素，再由系统排版成复盘卡。
          </p>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="ai-image-provider">生图供应商</Label>
            <OSESelect
              value={settings.imageProvider ?? ''}
              options={IMAGE_PROVIDERS}
              disabled={busy}
              onChange={(imageProvider) =>
                setSettings((prev) => ({ ...prev, imageProvider: imageProvider || null }))
              }
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="ai-image-model">生图模型名称</Label>
            <div className="flex gap-2">
              <Input
                id="ai-image-model"
                list="ai-image-model-options"
                value={settings.imageModel ?? ''}
                onChange={(event) =>
                  setSettings((prev) => ({ ...prev, imageModel: event.target.value }))
                }
                placeholder="留空使用默认值，例如 gpt-image-2"
                disabled={busy}
                maxLength={200}
              />
              <Button
                type="button"
                variant="secondary"
                onClick={fetchImageModels}
                disabled={busy}
                title="从生图供应商获取模型列表"
              >
                {loadingImageModels ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4" />
                )}
                获取
              </Button>
            </div>
            <datalist id="ai-image-model-options">
              {imageModels.map((model) => (
                <option key={model} value={model} />
              ))}
            </datalist>
            {imageModels.length ? (
              <p className="text-xs font-bold text-muted">可从输入框候选中选择，或继续手动输入。</p>
            ) : null}
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="ai-image-base-url">生图 Base URL（代理或 custom 时填写）</Label>
            <Input
              id="ai-image-base-url"
              value={settings.imageBaseUrl ?? ''}
              onChange={(event) =>
                setSettings((prev) => ({ ...prev, imageBaseUrl: event.target.value }))
              }
              placeholder="https://your-proxy.example.com/v1"
              disabled={busy}
              maxLength={500}
            />
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="ai-image-api-key">
              生图 API Key{' '}
              {settings.hasImageApiKey ? (
                <span className="ml-2 text-xs font-bold text-muted">
                  已保存：{settings.imageApiKeyMasked}
                </span>
              ) : null}
            </Label>
            <div className="flex gap-2">
              <Input
                id="ai-image-api-key"
                value={imageApiKeyDraft}
                onChange={(event) => setImageApiKeyDraft(event.target.value)}
                placeholder={
                  settings.hasImageApiKey ? '留空即保持现有生图 API Key' : '粘贴你的生图 API Key'
                }
                disabled={busy}
                type="password"
                maxLength={500}
                autoComplete="off"
              />
              {settings.hasImageApiKey ? (
                <Button
                  type="button"
                  variant="secondary"
                  onClick={clearImageApiKey}
                  disabled={busy}
                >
                  清空 Key
                </Button>
              ) : null}
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="ai-image-size">图片尺寸</Label>
            <OSESelect
              value={settings.imageSize || '1024x1536'}
              options={AI_IMAGE_SIZE_OPTIONS}
              disabled={busy}
              onChange={(imageSize) => setSettings((prev) => ({ ...prev, imageSize }))}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="ai-image-quality">图片质量</Label>
            <OSESelect
              value={settings.imageQuality || 'medium'}
              options={AI_IMAGE_QUALITY_OPTIONS}
              disabled={busy}
              onChange={(imageQuality) => setSettings((prev) => ({ ...prev, imageQuality }))}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="ai-image-output-format">输出格式</Label>
            <OSESelect
              value={settings.imageOutputFormat || 'webp'}
              options={AI_IMAGE_OUTPUT_FORMAT_OPTIONS}
              disabled={busy}
              onChange={(imageOutputFormat) =>
                setSettings((prev) => ({ ...prev, imageOutputFormat }))
              }
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="ai-image-style">复盘卡风格</Label>
            <OSESelect
              value={settings.imageStyle || 'clean_education_card'}
              options={AI_IMAGE_STYLE_OPTIONS}
              disabled={busy}
              onChange={(imageStyle) => setSettings((prev) => ({ ...prev, imageStyle }))}
            />
            <div className="overflow-hidden rounded-2xl border border-orange-100 bg-white">
              <Image
                src={selectedImageStyle.anchorUrl}
                alt={selectedImageStyle.label}
                width={1024}
                height={1536}
                className="block aspect-[2/3] w-full object-cover object-top"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="ai-image-rate-minute">每分钟生图上限</Label>
            <Input
              id="ai-image-rate-minute"
              value={settings.imageRateLimitPerMinute ?? DEFAULT_IMAGE_RATE_LIMIT_PER_MINUTE}
              onChange={(event) =>
                setSettings((prev) => ({
                  ...prev,
                  imageRateLimitPerMinute: Number.parseInt(event.target.value || '0', 10),
                }))
              }
              disabled={busy}
              type="number"
              min={0}
              max={1000}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="ai-image-rate-hour">每小时生图上限</Label>
            <Input
              id="ai-image-rate-hour"
              value={settings.imageRateLimitHourly ?? DEFAULT_IMAGE_RATE_LIMIT_HOURLY}
              onChange={(event) =>
                setSettings((prev) => ({
                  ...prev,
                  imageRateLimitHourly: Number.parseInt(event.target.value || '0', 10),
                }))
              }
              disabled={busy}
              type="number"
              min={0}
              max={10000}
            />
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="ai-image-rate-day">每日生图上限</Label>
            <Input
              id="ai-image-rate-day"
              value={settings.imageRateLimitDaily ?? DEFAULT_IMAGE_RATE_LIMIT_DAILY}
              onChange={(event) =>
                setSettings((prev) => ({
                  ...prev,
                  imageRateLimitDaily: Number.parseInt(event.target.value || '0', 10),
                }))
              }
              disabled={busy}
              type="number"
              min={0}
              max={100000}
            />
            <p className="text-xs font-bold text-muted">
              设为 0 表示不限制。批量生成讲解图时建议适当调高，实际并发仍由后台队列控制。
            </p>
          </div>
        </div>

        {message ? (
          <p
            className={`rounded-2xl px-4 py-3 text-sm font-bold ${message.kind === 'ok' ? 'bg-softGreen text-green-800' : 'bg-red-50 text-red-600'}`}
          >
            {message.text}
          </p>
        ) : null}

        {testResult ? (
          <div className="rounded-3xl bg-softGreen p-4 text-sm font-bold text-green-900">
            <p className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4" />
              文本模型测试通过：{testResult.provider} / {testResult.model}
            </p>
            <p className="mt-1">
              耗时：{testResult.latencyMs}ms，响应：{testResult.output || '(空响应)'}
            </p>
          </div>
        ) : null}

        {imageTestResult ? (
          <div className="rounded-3xl bg-softBlue p-4 text-sm font-bold text-navy">
            <p className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-green-700" />
              生图模型测试通过：{imageTestResult.provider} / {imageTestResult.model}
            </p>
            <p className="mt-1">
              耗时：{imageTestResult.latencyMs}ms，响应：{imageTestResult.output || '(空响应)'}
            </p>
          </div>
        ) : null}

        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" disabled={busy}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            保存设置
          </Button>
          <Button type="button" variant="secondary" onClick={testConnection} disabled={busy}>
            {testing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
            测试文本模型
          </Button>
          <Button type="button" variant="secondary" onClick={testVisionCapability} disabled={busy}>
            {testingVision ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Eye className="h-4 w-4" />
            )}
            测试视觉能力
          </Button>
          <Button type="button" variant="secondary" onClick={testImageConnection} disabled={busy}>
            {testingImage ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <ImageIcon className="h-4 w-4" />
            )}
            测试生图模型
          </Button>
          <Button type="button" variant="ghost" onClick={clearConfig} disabled={busy}>
            <Trash2 className="h-4 w-4" />
            清空个人配置
          </Button>
        </div>
      </form>
    </Card>
  );
}
