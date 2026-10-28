Set WshShell = CreateObject("WScript.Shell")
WshShell.Run "cmd /c node server.js", 0, False
Wscript.Sleep 1000
WshShell.Run "cmd /c start http://localhost:3000", 0, False

