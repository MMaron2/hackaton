# Lokalny serwer Radar Awarii: serwuje pliki strony + proxy dla stron statusu vendorów (omija blokadę CORS).
# Uruchom:  powershell -ExecutionPolicy Bypass -File server.ps1      (potem http://localhost:8080/)
# Proxy: /proxy?u=<adres https>  – tylko hosty z listy $allowed (nie jest to otwarty proxy).
param([int]$Port = 8080)

[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$root = $PSScriptRoot
$allowed = @(
  'status.aws.amazon.com', 'azure.status.microsoft', 'status.cloud.google.com',
  'www.cloudflarestatus.com', 'www.akamaistatus.com', 'status.snowflake.com', 'www.githubstatus.com'
)
$mime = @{
  '.html' = 'text/html; charset=utf-8'; '.js' = 'text/javascript; charset=utf-8'; '.css' = 'text/css; charset=utf-8'
  '.svg' = 'image/svg+xml'; '.json' = 'application/json; charset=utf-8'; '.png' = 'image/png'; '.ico' = 'image/x-icon'
}

function Send($res, [int]$code, [byte[]]$bytes, [string]$type) {
  $res.StatusCode = $code
  $res.ContentType = $type
  $res.Headers.Add('Cache-Control', 'no-store')
  $res.ContentLength64 = $bytes.Length
  $res.OutputStream.Write($bytes, 0, $bytes.Length)
}

$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$Port/")
$listener.Start()
Write-Host "Radar Awarii dziala: http://localhost:$Port/   (Ctrl+C aby zatrzymac)"

try {
  while ($listener.IsListening) {
    $ctx = $listener.GetContext()
    $req = $ctx.Request
    $res = $ctx.Response
    try {
      $path = $req.Url.AbsolutePath
      if ($path -eq '/proxy') {
        $target = $req.QueryString['u']
        if ($req.QueryString['ping']) {
          Send $res 200 ([Text.Encoding]::UTF8.GetBytes('ok')) 'text/plain'
        }
        else {
          $uri = $null
          if (-not [Uri]::TryCreate($target, [UriKind]::Absolute, [ref]$uri) -or $uri.Scheme -ne 'https' -or $allowed -notcontains $uri.Host) {
            Send $res 403 ([Text.Encoding]::UTF8.GetBytes('host niedozwolony')) 'text/plain'
          }
          else {
            $r = Invoke-WebRequest -Uri $uri -UseBasicParsing -TimeoutSec 15 -Headers @{ 'User-Agent' = 'radar-awarii-local-proxy' }
            $type = [string]$r.Headers['Content-Type']
            if (-not $type) { $type = 'application/octet-stream' }
            Send $res 200 $r.RawContentStream.ToArray() $type
          }
        }
      }
      else {
        if ($path -eq '/') { $path = '/index.html' }
        $file = [IO.Path]::GetFullPath((Join-Path $root ($path.TrimStart('/') -replace '/', '\')))
        if ($file.StartsWith($root) -and (Test-Path $file -PathType Leaf)) {
          $ext = [IO.Path]::GetExtension($file).ToLower()
          $type = if ($mime.ContainsKey($ext)) { $mime[$ext] } else { 'application/octet-stream' }
          Send $res 200 ([IO.File]::ReadAllBytes($file)) $type
        }
        else {
          Send $res 404 ([Text.Encoding]::UTF8.GetBytes('404')) 'text/plain'
        }
      }
    }
    catch {
      try { Send $res 502 ([Text.Encoding]::UTF8.GetBytes("blad: $($_.Exception.Message)")) 'text/plain' } catch {}
    }
    finally { $res.OutputStream.Close() }
  }
}
finally { $listener.Stop() }
