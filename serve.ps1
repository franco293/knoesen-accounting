param(
    [int]$Port = 8080
)
Write-Output "Serving http://localhost:$Port (press Ctrl+C to stop)"
python -m http.server $Port
