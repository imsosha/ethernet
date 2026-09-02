Set WshShell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
scriptDir = fso.GetParentFolderName(WScript.ScriptFullName)
clientDir = fso.BuildPath(scriptDir, "client")
electronExe = fso.BuildPath(clientDir, "node_modules\electron\dist\electron.exe")

WshShell.CurrentDirectory = clientDir
WshShell.Run """" & electronExe & """ """ & clientDir & """", 0, False
