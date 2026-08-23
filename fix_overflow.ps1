$c = Get-Content 'style-main.css' -Encoding UTF8
$c = $c -replace 'overflow:\s*hidden\s*!important;\s*/\*\s*iOS.*?\*/', 'overflow: visible !important; /* Changed to visible */'
Set-Content 'style-main.css' -Value ($c -join "`n") -Encoding UTF8
