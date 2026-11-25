@echo off
rem Windows: zatrzymuje serwery nasluchujace na portach 8700, 8641 i 8642 (odpowiednik stop_all.command z macOS).
rem Uwaga: zatrzymuje kazdy proces na tych portach, takze uruchomiony z innego folderu.
powershell -NoProfile -Command "$p = Get-NetTCPConnection -State Listen -LocalPort 8700,8641,8642 -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique; if ($p) { $p | ForEach-Object { Stop-Process -Id $_ -Force; Write-Host ('zatrzymano proces ' + $_) } } else { Write-Host 'Nic nie dzialalo na portach 8700, 8641, 8642.' }"
