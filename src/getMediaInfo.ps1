# Script PowerShell PERSISTENTE para obter informações de mídia e posição de reprodução.
# Inicializa a Windows Media Session API UMA ÚNICA VEZ e depois emite uma linha JSON
# por intervalo, em vez de ser relançado a cada poll (evita o custo de subir o CLR,
# carregar assemblies WinRT e fazer reflection a cada chamada).
param(
    [int]$IntervalMs = 1000
)

$ErrorActionPreference = 'Stop'

Add-Type -AssemblyName System.Runtime.WindowsRuntime

$asTaskGeneric = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1' })[0]

# Espera por uma operação assíncrona WinRT com TIMEOUT.
# Usar Wait(-1) (infinito) travava o loop quando a sessão de mídia entrava em
# transição (ex.: voltar/trocar faixa) e a operação nunca completava, congelando
# o app inteiro. Com timeout, retornamos $null e o loop segue na próxima iteração.
Function Await($WinRtTask, $ResultType, $TimeoutMs = 3000) {
    $asTask = $asTaskGeneric.MakeGenericMethod($ResultType)
    $netTask = $asTask.Invoke($null, @($WinRtTask))
    if (-not $netTask.Wait($TimeoutMs)) {
        return $null
    }
    $netTask.Result
}

[Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager,Windows.Media.Control,ContentType=WindowsRuntime] | Out-Null

# Inicialização única do gerenciador de sessões
$sessionManager = Await ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager]::RequestAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager])

while ($true) {
    $json = "{}"
    try {
        $currentSession = $sessionManager.GetCurrentSession()

        if ($null -ne $currentSession) {
            $mediaProperties = Await ($currentSession.TryGetMediaPropertiesAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties])

            # Timeout/transição da sessão: pula esta iteração sem zerar o estado.
            if ($null -eq $mediaProperties) {
                Start-Sleep -Milliseconds $IntervalMs
                continue
            }

            $timelineProperties = $currentSession.GetTimelineProperties()
            $playbackInfo = $currentSession.GetPlaybackInfo()

            $result = @{
                Title    = $mediaProperties.Title
                Artist   = $mediaProperties.Artist
                Album    = $mediaProperties.AlbumTitle
                Source   = $currentSession.SourceAppUserModelId
                Position = $timelineProperties.Position.TotalSeconds
                Duration = $timelineProperties.EndTime.TotalSeconds
                Status   = $playbackInfo.PlaybackStatus.ToString()
            }

            $json = $result | ConvertTo-Json -Compress
        }
    } catch {
        $json = "{}"
    }

    # Escreve uma linha e força o flush para que o Node receba imediatamente
    [Console]::Out.WriteLine($json)
    [Console]::Out.Flush()

    Start-Sleep -Milliseconds $IntervalMs
}
