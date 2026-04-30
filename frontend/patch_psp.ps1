$f = 'src/components/ProcessingSettingsPanel.tsx'
$c = Get-Content $f -Raw
$c = $c -replace 'import \{ useEffect, useMemo, useState \} from "react";', 'import { useEffect, useMemo, useState, useCallback } from "react";'
$c = $c -replace 'import \{ motion \} from "framer-motion";', 'import { motion, AnimatePresence } from "framer-motion";'
$c = $c -replace '  Loader2,\r\n\} from "lucide-react";', "  Loader2,`r`n  Sparkles,`r`n  Music2,`r`n} from `"lucide-react`";"
Set-Content $f -Value $c -NoNewline
Write-Host 'Done'
