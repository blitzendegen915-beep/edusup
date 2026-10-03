import sys

try:
    from .server import main
except ImportError as e:  # python-docx 未インストールなど
    sys.exit(f"必要なパッケージが足りません: {e}\n"
             "次のコマンドでインストールしてください:\n"
             "  python -m pip install python-docx")

main()
