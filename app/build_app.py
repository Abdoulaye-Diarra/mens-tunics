# -*- coding: utf-8 -*-
# Concatene les fichiers JS de l'application en un seul bundle.js (GitHub Pages
# sert des fichiers normaux : CSS/JS/images restent separes, seul ce petit
# regroupement JS est necessaire car core.js...ui3.js partagent une meme
# fonction (IIFE) coupee entre plusieurs fichiers).
# Le Client ID Google (le seul reglage propre a chaque utilisateur) ne passe
# PAS par ce script : il vit dans config.js, un fichier a part, modifiable
# directement dans l'editeur web de GitHub sans jamais relancer ce build.
import os

D = os.path.dirname(os.path.abspath(__file__))
FILES = ["core.js", "xl.js", "drive.js", "ui1.js", "ui2.js", "ui3.js"]
js = "".join(open(os.path.join(D, f), encoding="utf-8").read() for f in FILES)

out = os.path.join(D, "bundle.js")
open(out, "w", encoding="utf-8").write(js)
print("built", out, len(js) // 1024, "KB")
