#!/usr/bin/env bash
set -euo pipefail

source_dir="${1:-src-tauri/gen/android}"
output_dir="${2:-android-apk}"
name_prefix="${3:-OSE-Android}"

mkdir -p "$output_dir"
source_abs="$(cd "$source_dir" && pwd)"
output_abs="$(cd "$output_dir" && pwd)"

build_tools_dir="$(find "${ANDROID_HOME:?ANDROID_HOME is required}/build-tools" -mindepth 1 -maxdepth 1 -type d | sort -V | tail -n 1)"
if [ -z "$build_tools_dir" ]; then
  echo "Android build-tools not found under $ANDROID_HOME/build-tools" >&2
  exit 1
fi

zipalign="$build_tools_dir/zipalign"
apksigner="$build_tools_dir/apksigner"
if [ ! -x "$zipalign" ] || [ ! -x "$apksigner" ]; then
  echo "zipalign or apksigner not found in $build_tools_dir" >&2
  exit 1
fi

keystore="${RUNNER_TEMP:-/tmp}/ose-android-signing.jks"
store_password="${ANDROID_KEYSTORE_PASSWORD:-}"
key_alias="${ANDROID_KEY_ALIAS:-}"
key_password="${ANDROID_KEY_PASSWORD:-${ANDROID_KEYSTORE_PASSWORD:-}}"
keystore_type="${ANDROID_KEYSTORE_TYPE:-}"

if [ -n "${ANDROID_KEYSTORE_BASE64:-}" ] &&
  [ -n "$store_password" ] &&
  [ -n "$key_alias" ] &&
  [ -n "$key_password" ]; then
  printf '%s' "$ANDROID_KEYSTORE_BASE64" | base64 --decode >"$keystore"
  echo "Signing Android APKs with repository keystore secret."
else
  store_password="android-ci-keystore"
  key_password="$store_password"
  key_alias="ose-ci"
  keystore_type="PKCS12"
  keytool -genkeypair \
    -keystore "$keystore" \
    -storetype "$keystore_type" \
    -storepass "$store_password" \
    -keypass "$key_password" \
    -alias "$key_alias" \
    -keyalg RSA \
    -keysize 2048 \
    -validity 10000 \
    -dname "CN=OSE CI, OU=CI, O=OSE, L=Unknown, ST=Unknown, C=US" >/dev/null
  echo "Signing Android APKs with an ephemeral CI keystore. Configure ANDROID_KEYSTORE_* secrets for stable release signing."
fi

mapfile -t apks < <(
  find "$source_abs" -type f -name "*.apk" \
    ! -path "$output_abs/*" \
    ! -name "*-aligned.apk" \
    ! -name "*-signed.apk" |
    sort
)
if [ "${#apks[@]}" -eq 0 ]; then
  echo "No unsigned APK files found under $source_dir" >&2
  find "$source_abs" -type f -name "*.apk" -print >&2 || true
  exit 1
fi

index=1
for apk in "${apks[@]}"; do
  base="$(basename "$apk" .apk)"
  flavor="$(printf '%s' "$base" | tr '[:upper:]' '[:lower:]' | tr -cs 'a-z0-9._-' '-')"
  aligned="${RUNNER_TEMP:-/tmp}/${base}-aligned.apk"

  if [ "${#apks[@]}" -eq 1 ]; then
    signed="$output_dir/${name_prefix}.apk"
  else
    signed="$output_dir/${name_prefix}-${index}-${flavor}.apk"
  fi

  "$zipalign" -p -f 4 "$apk" "$aligned"
  sign_args=(
    sign
    --ks "$keystore"
    --ks-key-alias "$key_alias"
    --ks-pass "pass:$store_password"
    --key-pass "pass:$key_password"
    --out "$signed"
  )
  if [ -n "$keystore_type" ]; then
    sign_args+=(--ks-type "$keystore_type")
  fi
  sign_args+=("$aligned")

  "$apksigner" "${sign_args[@]}"
  "$apksigner" verify --verbose "$signed"
  index=$((index + 1))
done

ls -la "$output_dir"
