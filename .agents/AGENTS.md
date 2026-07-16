# Track75 Attendance Co-Pilot Rules & Guidelines

To parse scanned university timetables perfectly and calculate attendance metrics with zero error, follow these rules:

## 🧠 Part 1: Tabular Normalization & Alignment
1. **Never merge independent subjects**: If multiple subject codes (e.g. `CS102C` and `CS204C`) appear in the same details or timetable row due to horizontal OCR text merging, discard the merged details and extract the subjects independently directly from the timetable grid cells.
2. **Dynamic subject code detection**: Use digit-based course codes regex matching (e.g. `/\b([A-Z¢©®]*\d+[A-Z\d¢©®]*)\b/i`) to distinguish course codes from generic subject words like `CHEMISTRY` or `PHYSICS`.
3. **AM/PM Precision**: Match time slots using explicit AM/PM tags if available, and fallback to implicit afternoon hours (1:00 PM to 6:00 PM) if the numbers fall in that range.

## 📋 Part 2: Attendance Formulas
To maintain at least **75% attendance**, the minimum number of attended classes ($C_{\text{attended}}$) and the maximum safe absences or "Bunk Budget" ($A_{\text{max}}$) are calculated as:

$$\text{Minimum Attended Class Requirement: } C_{\text{attended}} \ge \lceil 0.75 \times T \rceil$$

$$\text{Maximum Allowed Absences (Bunk Budget): } A_{\text{max}} = \lfloor 0.25 \times T \rfloor$$

### 🔄 The Double-Check Inequality
Always verify that:
$$C_{\text{attended}} + A_{\text{max}} = T$$
$$\text{Actual Min \% Attendance} = \left( \frac{C_{\text{attended}}}{T} \right) \times 100 \ge 75\%$$
If this inequality fails for any subject, flag an error and recalculate.
