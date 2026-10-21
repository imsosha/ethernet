[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
[Console]::InputEncoding = [System.Text.Encoding]::UTF8

Add-Type -AssemblyName System.Runtime.WindowsRuntime
$asTaskGeneric = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { 
    $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1' 
})[0]

function Await-Op($op, $type) {
    if (-not $op) { return $null }
    try {
        $m = $asTaskGeneric.MakeGenericMethod($type)
        return $m.Invoke($null, @($op)).GetAwaiter().GetResult()
    } catch {
        return $null
    }
}

[Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager, Windows.Media, ContentType = WindowsRuntime] | Out-Null
[Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties, Windows.Media, ContentType = WindowsRuntime] | Out-Null
[Windows.Storage.Streams.IRandomAccessStreamWithContentType, Windows.Storage.Streams, ContentType = WindowsRuntime] | Out-Null
[Windows.Storage.Streams.IRandomAccessStream, Windows.Storage.Streams, ContentType = WindowsRuntime] | Out-Null
[Windows.Storage.Streams.IInputStream, Windows.Storage.Streams, ContentType = WindowsRuntime] | Out-Null
$script:asStreamMethod = [System.IO.WindowsRuntimeStreamExtensions].GetMethod("AsStreamForRead", [type[]]@([Windows.Storage.Streams.IInputStream]))

function Get-SessionManager() {
    try {
        $op = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager]::RequestAsync()
        return Await-Op $op ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager])
    } catch {
        return $null
    }
}

function Get-SystemSession() {
    try {
        $mgr = Get-SessionManager
        if (-not $mgr) { return $null }

        # 1. Сначала проверяем активную текущую сессию Windows
        $cur = $mgr.GetCurrentSession()
        if ($cur) {
            $curApp = ($cur.SourceAppUserModelId + '').ToLower()
            if ($curApp -notmatch 'telegram' -and $curApp -notmatch 'ethernet' -and $curApp -notmatch 'hermes') {
                return $cur
            }
        }

        # 2. Если текущая не подходит, ищем играющую сессию среди всех зарегистрированных
        $sessions = $mgr.GetSessions()
        if ($sessions) {
            foreach ($s in @($sessions)) {
                $app = ($s.SourceAppUserModelId + '').ToLower()
                if ($app -notmatch 'telegram' -and $app -notmatch 'ethernet' -and $app -notmatch 'hermes') {
                    try {
                        $pb = $s.GetPlaybackInfo()
                        if ($pb -and $pb.PlaybackStatus.ToString() -eq 'Playing') {
                            return $s
                        }
                    } catch {}
                }
            }
            # 3. Ищем любую не-Telegram сессию с заполненным названием трека или статусом Paused
            foreach ($s in @($sessions)) {
                $app = ($s.SourceAppUserModelId + '').ToLower()
                if ($app -notmatch 'telegram' -and $app -notmatch 'ethernet' -and $app -notmatch 'hermes') {
                    try {
                        $props = Await-Op ($s.TryGetMediaPropertiesAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties])
                        if ($props -and -not [string]::IsNullOrWhiteSpace($props.Title)) {
                            return $s
                        }
                    } catch {}
                }
            }
            # 4. Если ничего не подошло, берем первую не-Telegram
            foreach ($s in @($sessions)) {
                $app = ($s.SourceAppUserModelId + '').ToLower()
                if ($app -notmatch 'telegram' -and $app -notmatch 'ethernet' -and $app -notmatch 'hermes') {
                    return $s
                }
            }
        }
    } catch {}
    return $null
}

$script:cachedThumbTrack = ''
$script:cachedThumbData = ''

function Get-State() {
    $s = Get-SystemSession
    if (-not $s) {
        return @{ active = $false }
    }

    $app = $s.SourceAppUserModelId
    $props = Await-Op ($s.TryGetMediaPropertiesAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties])
    $timeline = $s.GetTimelineProperties()
    $playback = $s.GetPlaybackInfo()

    $status = 'Closed'
    if ($playback) {
        $status = $playback.PlaybackStatus.ToString()
    }

    $title = if ($props) { $props.Title } else { '' }
    $artist = if ($props) { $props.Artist } else { '' }
    $album = if ($props) { $props.AlbumTitle } else { '' }

    $thumbnail = ''
    if ($props -and $props.Thumbnail) {
        $trackKey = "$title|$artist|$album"
        if ($trackKey -eq $script:cachedThumbTrack -and -not [string]::IsNullOrEmpty($script:cachedThumbData)) {
            $thumbnail = $script:cachedThumbData
        } else {
            try {
                $streamOp = $props.Thumbnail.OpenReadAsync()
                $stream = Await-Op $streamOp ([Windows.Storage.Streams.IRandomAccessStreamWithContentType])
                if (-not $stream) {
                    $stream = Await-Op $streamOp ([Windows.Storage.Streams.IRandomAccessStream])
                }
                if ($stream -and $script:asStreamMethod) {
                    $netStream = $script:asStreamMethod.Invoke($null, @($stream))
                    if ($netStream) {
                        $ms = New-Object System.IO.MemoryStream
                        $netStream.CopyTo($ms)
                        $bytes = $ms.ToArray()
                        if ($bytes -and $bytes.Length -gt 0) {
                            $mime = 'image/jpeg'
                            if ($bytes.Length -gt 4) {
                                if ($bytes[0] -eq 0x89 -and $bytes[1] -eq 0x50) { $mime = 'image/png' }
                                elseif ($bytes[0] -eq 0xFF -and $bytes[1] -eq 0xD8) { $mime = 'image/jpeg' }
                                elseif ($bytes[0] -eq 0x47 -and $bytes[1] -eq 0x49) { $mime = 'image/gif' }
                                elseif ($bytes[0] -eq 0x52 -and $bytes[1] -eq 0x49) { $mime = 'image/webp' }
                            }
                            $thumbnail = "data:$mime;base64," + [Convert]::ToBase64String($bytes)
                            $script:cachedThumbTrack = $trackKey
                            $script:cachedThumbData = $thumbnail
                        }
                        $ms.Dispose()
                        $netStream.Dispose()
                    }
                }
            } catch {
                [Console]::Error.WriteLine("[system-media] thumb error: " + $_.ToString())
            }
        }
    } else {
        $script:cachedThumbTrack = ''
        $script:cachedThumbData = ''
    }

    $pos = 0
    $dur = 0
    if ($timeline) {
        $pos = $timeline.Position.TotalSeconds
        $dur = $timeline.EndTime.TotalSeconds
        if ($status -eq 'Playing' -and $timeline.LastUpdatedTime) {
            $elapsed = ([DateTimeOffset]::UtcNow - $timeline.LastUpdatedTime).TotalSeconds
            if ($elapsed -gt 0 -and $elapsed -lt 86400) {
                $pos = [math]::Min($dur, $pos + $elapsed)
            }
        }
        $pos = [math]::Round($pos, 1)
        $dur = [math]::Round($dur, 1)
    }

    $isActive = ($status -eq 'Playing') -or (-not [string]::IsNullOrWhiteSpace($title))

    return @{
        active = [bool]$isActive
        app = $app
        title = $title
        artist = $artist
        album = $album
        status = $status
        position = $pos
        duration = $dur
        thumbnail = $thumbnail
    }
}

# Сигнализируем Node.js, что процесс готов к приёму команд
Write-Output "READY"

while ($true) {
    $line = [Console]::In.ReadLine()
    if ($null -eq $line) { break }
    $trimmed = $line.Trim()
    if ($trimmed -eq '' -or $trimmed -eq 'exit') { break }

    try {
        $req = ConvertFrom-Json $trimmed
        $cmd = $req.cmd

        if ($cmd -eq 'poll' -or $cmd -eq 'get') {
            $state = Get-State
            Write-Output (ConvertTo-Json $state -Compress)
        }
        elseif ($cmd -eq 'play') {
            $s = Get-SystemSession
            if ($s) { Await-Op ($s.TryPlayAsync()) ([bool]) | Out-Null }
            $state = Get-State
            Write-Output (ConvertTo-Json $state -Compress)
        }
        elseif ($cmd -eq 'pause') {
            $s = Get-SystemSession
            if ($s) { Await-Op ($s.TryPauseAsync()) ([bool]) | Out-Null }
            $state = Get-State
            Write-Output (ConvertTo-Json $state -Compress)
        }
        elseif ($cmd -eq 'toggle') {
            $s = Get-SystemSession
            if ($s) { Await-Op ($s.TryTogglePlayPauseAsync()) ([bool]) | Out-Null }
            $state = Get-State
            Write-Output (ConvertTo-Json $state -Compress)
        }
        elseif ($cmd -eq 'next') {
            $s = Get-SystemSession
            if ($s) { Await-Op ($s.TrySkipNextAsync()) ([bool]) | Out-Null }
            $state = Get-State
            Write-Output (ConvertTo-Json $state -Compress)
        }
        elseif ($cmd -eq 'prev') {
            $s = Get-SystemSession
            if ($s) { Await-Op ($s.TrySkipPreviousAsync()) ([bool]) | Out-Null }
            $state = Get-State
            Write-Output (ConvertTo-Json $state -Compress)
        }
        elseif ($cmd -eq 'seek') {
            $s = Get-SystemSession
            if ($s -and $null -ne $req.pos) {
                $ticks = [long]([double]$req.pos * 10000000.0)
                Await-Op ($s.TryChangePlaybackPositionAsync($ticks)) ([bool]) | Out-Null
            }
            $state = Get-State
            Write-Output (ConvertTo-Json $state -Compress)
        }
        else {
            Write-Output '{"error":"unknown_cmd"}'
        }
    }
    catch {
        Write-Output ("{`"error`":`"" + $_.Exception.Message.Replace('"', '\"') + "`"}")
    }
}
