Je website kan op je eigen domein staan, zoals www.jouwbureau.nl. Een beveiligd certificaat regelen wij.

## 1. Domein toevoegen

Ga naar **Website → Domein** en vul je domein in, bijvoorbeeld www.jouwbureau.nl.

## 2. DNS instellen

Log in bij de partij waar je domein staat (bijvoorbeeld TransIP, Hostnet of Versio) en voeg de records toe die StageDesk toont:

| Type | Naam | Waarde |
| --- | --- | --- |
| CNAME | www | het adres dat StageDesk toont |
| TXT | _stagedesk | de controlecode |

Wil je ook jouwbureau.nl zonder www gebruiken, stel dan bij je provider een doorverwijzing in naar www.

## 3. Controleren

Kies **Controleren**. Wijzigingen in DNS kunnen tot een paar uur duren. Zodra de controle slaagt, staat je site op je domein en maken we automatisch een certificaat aan.

## Problemen

- **Controle mislukt:** kijk of de naam precies klopt. Sommige providers voegen je domeinnaam zelf toe; vul dan alleen *www* in.
- **Oude website zichtbaar:** er staat nog een A-record voor www. Verwijder dat.
