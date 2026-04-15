#!/usr/bin/env python3
"""Update lightweight-mode-hint locale value to remove specific memory numbers."""
import os
import re

LOCALES_DIR = "src/shared/locales"

# New hint translations — no specific memory numbers
HINTS = {
    "ar":    "تدمير WebView عند التصغير إلى شريط النظام لتقليل استهلاك الذاكرة",
    "bg":    "Унищожаване на WebView при минимизиране в системния трей за намаляване на паметта",
    "ca":    "Destruir el WebView en minimitzar a la safata per reduir l\\'ús de memòria",
    "de":    "WebView beim Minimieren in den Tray zerstören, um den Speicherverbrauch zu senken",
    "el":    "Καταστροφή του WebView κατά την ελαχιστοποίηση στο δίσκο για μείωση της χρήσης μνήμης",
    "en-US": "Destroy WebView on minimize to tray to reduce memory usage",
    "es":    "Destruir WebView al minimizar a la bandeja para reducir el uso de memoria",
    "fa":    "از بین بردن WebView هنگام کوچک‌سازی به سینی سیستم برای کاهش مصرف حافظه",
    "fr":    "Détruire le WebView lors de la réduction dans la barre des tâches pour réduire la mémoire",
    "hu":    "WebView megsemmisítése a tálcára kicsinyítéskor a memóriahasználat csökkentéséhez",
    "id":    "Hancurkan WebView saat diperkecil ke baki sistem untuk mengurangi penggunaan memori",
    "it":    "Distruggi la WebView quando minimizzato nel vassoio per ridurre l\\'uso della memoria",
    "ja":    "トレイに最小化する際に WebView を破棄してメモリ使用量を削減します",
    "ko":    "트레이로 최소화 시 WebView를 제거하여 메모리 사용량을 줄입니다",
    "nb":    "Ødelegg WebView ved minimering til systemstatusfeltet for å redusere minnebruk",
    "nl":    "Vernietig WebView bij minimaliseren naar systeemvak om geheugengebruik te verminderen",
    "pl":    "Zniszcz WebView przy minimalizacji do zasobnika, aby zmniejszyć użycie pamięci",
    "pt-BR": "Destruir WebView ao minimizar para a bandeja para reduzir o uso de memória",
    "ro":    "Distruge WebView la minimizarea în tava de sistem pentru a reduce consumul de memorie",
    "ru":    "Уничтожить WebView при сворачивании в трей для снижения потребления памяти",
    "th":    "ทำลาย WebView เมื่อย่อลงถาดระบบเพื่อลดการใช้หน่วยความจำ",
    "tr":    "Sistem tepsisine küçültürken WebView\\'ı yok ederek bellek kullanımını azaltın",
    "uk":    "Знищити WebView при згортанні в трей для зменшення використання пам\\'яті",
    "vi":    "Hủy WebView khi thu nhỏ xuống khay hệ thống để giảm sử dụng bộ nhớ",
    "zh-CN": "最小化到托盘时销毁 WebView 以降低内存占用",
    "zh-TW": "最小化到系統匣時銷毀 WebView 以降低記憶體佔用",
}

def update_locale(locale_dir, hint_value):
    filepath = os.path.join(LOCALES_DIR, locale_dir, "preferences.js")
    if not os.path.isfile(filepath):
        print(f"  SKIP {filepath} (not found)")
        return
    with open(filepath, "r", encoding="utf-8") as f:
        content = f.read()

    # Replace the existing lightweight-mode-hint value
    pattern = r"('lightweight-mode-hint'\s*:\s*')([^']*)(')"
    replacement = rf"\g<1>{hint_value}\3"
    new_content, count = re.subn(pattern, replacement, content)
    if count == 0:
        print(f"  WARN {locale_dir}: key 'lightweight-mode-hint' not found")
        return
    with open(filepath, "w", encoding="utf-8") as f:
        f.write(new_content)
    print(f"  OK   {locale_dir}")

print("Updating lightweight-mode-hint translations...")
for locale, hint in sorted(HINTS.items()):
    update_locale(locale, hint)
print("Done.")
