"""ExamStudio.exe の入口（PyInstaller用）。Pythonが入っていないPCでも動くよう、
Python本体・python-docx ごと .exe にまとめる。"""
import sys
import traceback


def run():
    for stream in (sys.stdout, sys.stderr):  # 英語版Windowsでも日本語表示で落ちないように
        try:
            stream.reconfigure(errors="replace")
        except Exception:
            pass
    try:
        from exam_app.ui.server import main
        main()
    except SystemExit:
        raise
    except Exception:  # 起動に失敗しても黒い画面がすぐ消えないように
        traceback.print_exc()
        input("\n起動に失敗しました。この画面の内容を作成者に伝えてください。Enterキーで閉じます。")
        sys.exit(1)


if __name__ == "__main__":
    run()
