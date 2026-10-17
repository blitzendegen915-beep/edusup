"""APIキーを「このPCに保存する」機能（Windowsのみ・任意）。

Windows 標準の暗号化（DPAPI）で暗号化して保存するので、同じPCの同じWindowsユーザーでしか
復号できない。ファイルを他人のPCにコピーしても読めない。保存先は試験データとは別の
%APPDATA%\\ExamStudio\\keys.json（共有フォルダやバックアップZIPに入らないように）。
Windows 以外では使えない（保存しない）。
"""
from __future__ import annotations

import base64
import ctypes
import json
import os
import sys
from pathlib import Path

ENV = {"anthropic": "ANTHROPIC_API_KEY", "openai": "OPENAI_API_KEY"}
_FLAGS = 0x01  # CRYPTPROTECT_UI_FORBIDDEN（画面を出さない）


def available() -> bool:
    return sys.platform == "win32"


def _path() -> Path:
    return Path(os.environ.get("APPDATA") or Path.home()) / "ExamStudio" / "keys.json"


class _Blob(ctypes.Structure):
    _fields_ = [("cbData", ctypes.c_uint32), ("pbData", ctypes.POINTER(ctypes.c_char))]


def _dpapi(protect: bool, data: bytes) -> bytes:
    buf = ctypes.create_string_buffer(data, len(data))
    inp = _Blob(len(data), ctypes.cast(buf, ctypes.POINTER(ctypes.c_char)))
    out = _Blob()
    crypt32 = ctypes.windll.crypt32  # type: ignore[attr-defined]
    fn = crypt32.CryptProtectData if protect else crypt32.CryptUnprotectData
    if not fn(ctypes.byref(inp), None, None, None, None, _FLAGS, ctypes.byref(out)):
        raise OSError("Windows の暗号化（DPAPI）に失敗しました")
    try:
        return ctypes.string_at(out.pbData, out.cbData)
    finally:
        ctypes.windll.kernel32.LocalFree(out.pbData)  # type: ignore[attr-defined]


def _read() -> dict:
    try:
        return json.loads(_path().read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {}


def _write(data: dict):
    f = _path()
    f.parent.mkdir(parents=True, exist_ok=True)
    tmp = f.with_suffix(".tmp")
    tmp.write_text(json.dumps(data), encoding="utf-8")
    os.replace(tmp, f)


def has(provider: str) -> bool:
    return available() and bool(_read().get(provider))


def save(provider: str, key: str, model: str = ""):
    """キーを暗号化して保存し、次回の起動時に自動で読み込むようにする。"""
    if not available() or provider not in ENV or not key:
        return
    data = _read()
    data[provider] = base64.b64encode(_dpapi(True, key.encode("utf-8"))).decode("ascii")
    data["provider"] = provider
    if model:
        data["openai_model"] = model
    _write(data)


def set_provider(provider: str):
    if available() and _read():
        data = _read()
        data["provider"] = provider
        _write(data)


def clear(provider: str):
    if not available():
        return
    data = _read()
    data.pop(provider, None)
    if not any(data.get(p) for p in ENV):
        try:
            _path().unlink()
        except OSError:
            pass
        return
    _write(data)


def load_into_env() -> list:
    """起動時に、保存してあるキーを環境変数に読み込む（失敗しても起動は止めない）。"""
    if not available():
        return []
    data, loaded = _read(), []
    for prov, env in ENV.items():
        if data.get(prov) and not os.environ.get(env):
            try:
                os.environ[env] = _dpapi(False, base64.b64decode(data[prov])).decode("utf-8")
                loaded.append(prov)
            except (OSError, ValueError):
                continue  # 別のユーザー・別のPCで作られたファイルなどは無視
    if data.get("provider") == "openai" and "openai" in loaded:
        os.environ["EXAM_AI_PROVIDER"] = "openai"
    if data.get("openai_model") and not os.environ.get("OPENAI_MODEL"):
        os.environ["OPENAI_MODEL"] = data["openai_model"]
    return loaded


def roundtrip_ok() -> bool:
    """CI（Windows）で暗号化と復号が往復できるかを確かめる。"""
    secret = "sk-test-日本語-123"
    return _dpapi(False, _dpapi(True, secret.encode("utf-8"))).decode("utf-8") == secret
