#!/bin/sh
# 定期考査スタジオ 起動（Mac: ダブルクリック / Linux: ./start_exam_studio.command）
cd "$(dirname "$0")"
PY=python3
command -v python3 >/dev/null 2>&1 || PY=python
$PY -c "import docx" 2>/dev/null || $PY -m pip install --user python-docx
exec $PY -m exam_app.ui
