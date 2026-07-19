Write-Host "=== EIMP Platform Auto Repair Starting ===" -ForegroundColor Cyan

$files = Get-ChildItem -Path ".\backend\src" -Recurse -Filter "*.ts"

foreach ($file in $files) {

    $content = Get-Content $file.FullName -Raw

    if ($content -match "PdfPrinter") {

        Write-Host "Checking: $($file.FullName)" -ForegroundColor Yellow

        # Fix old pdfmake import styles
        $content = $content -replace `
        "import\s+\*\s+as\s+PdfPrinter\s+from\s+['""]pdfmake['""];",
        "import PdfPrinter from 'pdfmake';"

        $content = $content -replace `
        "import\s+\{\s*PdfPrinter\s*\}\s+from\s+['""]pdfmake['""];",
        "import PdfPrinter from 'pdfmake';"

        # Fix constructor if require style exists
        $content = $content -replace `
        "const PdfPrinter\s*=\s*require\(['""]pdfmake['""]\);",
        "import PdfPrinter from 'pdfmake';"

        Set-Content $file.FullName $content

        Write-Host "Fixed imports in $($file.Name)" -ForegroundColor Green
    }
}

Write-Host ""
Write-Host "=== Checking package version ===" -ForegroundColor Cyan

docker compose exec backend npm list pdfmake

Write-Host ""
Write-Host "=== Restarting backend ===" -ForegroundColor Cyan

docker compose restart backend

Start-Sleep -Seconds 5

docker compose logs backend --tail=50

Write-Host ""
Write-Host "=== Repair Complete ===" -ForegroundColor Green
