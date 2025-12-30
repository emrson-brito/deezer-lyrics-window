# Script PowerShell para obter informações de mídia e posição de reprodução
Add-Type -AssemblyName System.Runtime.WindowsRuntime

$asTaskGeneric = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1' })[0]

Function Await($WinRtTask, $ResultType) {
    $asTask = $asTaskGeneric.MakeGenericMethod($ResultType)
    $netTask = $asTask.Invoke($null, @($WinRtTask))
    $netTask.Wait(-1) | Out-Null
    $netTask.Result
}

[Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager,Windows.Media.Control,ContentType=WindowsRuntime] | Out-Null

$sessionManager = Await ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager]::RequestAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager])

$currentSession = $sessionManager.GetCurrentSession()

if ($null -ne $currentSession) {
    $mediaProperties = Await ($currentSession.TryGetMediaPropertiesAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties])
    $timelineProperties = $currentSession.GetTimelineProperties()
    
    $result = @{
        Title = $mediaProperties.Title
        Artist = $mediaProperties.Artist
        Album = $mediaProperties.AlbumTitle
        Source = $currentSession.SourceAppUserModelId
        Position = $timelineProperties.Position.TotalSeconds
        Duration = $timelineProperties.EndTime.TotalSeconds
    }
    
    # Retornar como JSON
    $result | ConvertTo-Json -Compress
}
