"""Movimento «Demo su e giù» v2: proposta di Gergo, generata dalla console il 2026-11-05T15:40:28.259Z.

Solo dati, nessuna logica. Esito del test: 2 passi eseguiti con esito ok; l'operatore ha detto che è corretto.
Evidenze nel registro (events.id): 6038d0c0-5248-496a-ac91-389c20ca5ce8, 6d4376a4-f806-4ffe-b8a0-f97e4b3b53d6, 12b29204-c2dc-4147-af29-e2aebdf151cc, da79fe0b-673d-4c28-9f14-87ae6994c558.
Il bridge rivalida tutto con bridge/validator.py prima di eseguire; questo file non cambia limiti né whitelist.
"""

MOVIMENTO = {
    "id": "demo_su_giu",
    "name": "Demo su e giù",
    "version": 2,
    "base": None,
    "steps": [
        {
            "direzione": "su",
            "quantita": 2,
            "unita": "cm",
        },
        {
            "direzione": "giu",
            "quantita": 2,
            "unita": "cm",
        },
    ],
    "history": [
        "v1: su 1 cm, giù 1 cm",
        "feedback: troppo poco, fai 2 centimetri",
        "v2: su 2 cm, giù 2 cm",
        "è giusto",
    ],
    "esito": "corretto secondo l'operatore",
    "command_ids": [
        "6038d0c0-5248-496a-ac91-389c20ca5ce8",
        "6d4376a4-f806-4ffe-b8a0-f97e4b3b53d6",
    ],
}
