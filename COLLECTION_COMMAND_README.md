# Collection Command - Discord Slash Command

## Přehled

Discord bot nyní podporuje slash command `/collection`, který zobrazuje detailní informace o NFT kolekci přímo v Discord kanálu.

## Funkce

Command `/collection {collectionSlug}` zobrazuje:

1. **Název kolekce** - oficiální název kolekce
2. **Floor Price** - aktuální floor price v ETH
3. **Total Supply** - celkový počet NFT v kolekci
4. **Royalties** - creator fees a platform fees
5. **Unique Holders** - počet unikátních vlastníků
6. **Volume** - celkový objem obchodování
7. **Popis** - popis kolekce (pokud je dostupný)
8. **Sociální odkazy** - Twitter, Discord, Website, OpenSea

## Použití

### Základní použití
```
/collection tiny-buds40x40
```

### S určením sítě
```
/collection tiny-buds40x40 chain:Base
```

## Podporované sítě

- **Base** (výchozí)
- **Ethereum**
- **Polygon**
- **Arbitrum**
- **Optimism**

## Instalace a spuštění

1. **Ujistěte se, že máte správně nastavené environment proměnné:**
   ```bash
   DISCORD_BOT_TOKEN=your_bot_token
   DISCORD_CHANNEL_ID=your_channel_id
   OPENSEA_API_KEY=your_opensea_api_key
   ```

2. **Spusťte bota:**
   ```bash
   npm start
   ```

3. **Bot automaticky zaregistruje slash command při spuštění**

## Testování

Pro testování collection command můžete použít:

```bash
node test-collection-command.js tiny-buds40x40
```

## Technické detaily

### Struktura souborů
- `services/collectionCommand.js` - implementace collection command
- `services/commandManager.js` - správce všech slash commands
- `services/discordNotifier.js` - upravený pro podporu slash commands
- `services/nftTracker.js` - přidána metoda `getCollectionStatsBySlug`

### API Endpoints
Command používá OpenSea API V2 pro získání:
- Collection info: `/api/v2/collections/{slug}`
- Collection stats: `/api/v2/collections/{slug}/stats`
- Creator fees: `/api/v2/collections/{slug}/creator_fees`

### Rate Limiting
- Implementovány delays mezi API calls (200ms)
- Graceful handling rate limit errors
- User-friendly error messages

## Troubleshooting

### Command se nezobrazuje
- Zkontrolujte, že bot má oprávnění pro aplikaci slash commands
- Slash commands se propagují až 1 hodinu
- Restartujte bota pro okamžitou registraci

### API Errors
- Zkontrolujte OpenSea API key
- Ověřte, že collection slug existuje
- Zkontrolujte podporovanou síť

### Discord Permissions
Bot potřebuje následující oprávnění:
- `applications.commands` - pro registraci slash commands
- `Send Messages` - pro odesílání odpovědí
- `Use Slash Commands` - pro spouštění commands

## Příklady použití

### Příklad 1: Base kolekce
```
/collection tiny-buds40x40
```
Zobrazí informace o Tiny Buds kolekci na Base síti.

### Příklad 2: Ethereum kolekce
```
/collection boredapeyachtclub chain:Ethereum
```
Zobrazí informace o Bored Ape Yacht Club na Ethereum síti.

## Support

Pro technickou podporu nebo reportování bugů kontaktujte vývojáře nebo vytvořte issue v repository.
