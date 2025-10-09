# External Tag Sources

This folder is for external tag databases you find on GitHub or elsewhere.

## 📁 How to Add External Tag Sources

When you find a tag database repository, place the tag files here and they'll automatically be included in synonym generation.

## 🔍 Where to Find Tag Databases

### Recommended GitHub Searches:

```
site:github.com "tag aliases" json
site:github.com danbooru tags csv
site:github.com gelbooru tag database
site:github.com nhentai tag mapping
site:github.com e-hentai tag synonyms
site:github.com booru tag implications
```

### Known Good Sources:

1. **Danbooru Tag Data**
   - Export tags from: https://danbooru.donmai.us/tag_aliases.json
   - Save as: `danbooru-aliases.json`

2. **Gelbooru Tags**
   - API: https://gelbooru.com/index.php?page=dapi&s=tag&q=index
   - Save tag data as: `gelbooru-tags.json`

3. **Custom Mappings**
   - Create your own in any supported format below

## 📝 Supported File Formats

### 1. JSON Format (Recommended)

**Object style:**
```json
{
  "femdom": {
    "aliases": ["female domination", "fem dom"],
    "category": "female",
    "sites": {
      "nhentai": "female-domination",
      "ehentai": "femdom"
    }
  },
  "futanari": {
    "aliases": ["futa", "dickgirl", "futanarization"],
    "category": "female"
  }
}
```

**Array style:**
```json
[
  {
    "tag": "femdom",
    "aliases": ["female domination", "fem dom"],
    "category": "female"
  },
  {
    "tag": "futanari",
    "aliases": ["futa", "dickgirl"]
  }
]
```

### 2. CSV Format

```csv
original,alias1,alias2,alias3
femdom,female domination,fem dom,female dominance
futanari,futa,dickgirl,futanarization
nakadashi,creampie,internal cumshot
```

### 3. TXT Format (Simple)

```txt
femdom = female domination, fem dom, female dominance
futanari = futa, dickgirl, futanarization
nakadashi = creampie, internal cumshot
```

## 🚀 How to Use

1. **Place files in this folder**
   ```
   /search repos/external/danbooru-tags.json
   /search repos/external/gelbooru-tags.csv
   /search repos/external/custom-mappings.txt
   ```

2. **Edit the generator** (optional)
   Open `/scripts/generateTagSynonyms.ts` and add:
   ```typescript
   import { importExternalTags } from './importExternalTags';
   
   const externalSources = [
       { name: 'Danbooru', path: './search repos/external/danbooru-tags.json', format: 'json' },
       { name: 'Gelbooru', path: './search repos/external/gelbooru-tags.csv', format: 'csv' },
   ];
   
   const externalMappings = await importExternalTags(externalSources);
   ```

3. **Regenerate synonyms**
   ```bash
   npm run generate-tag-synonyms
   ```

## 💡 Example External Sources to Try

Copy these commands when you find the sources:

```bash
# Danbooru tag aliases (if available)
curl -o danbooru-aliases.json https://danbooru.donmai.us/tag_aliases.json

# Gelbooru tags (if API available)
curl -o gelbooru-tags.json "https://gelbooru.com/index.php?page=dapi&s=tag&q=index&json=1"

# Clone a tag database repo
git clone https://github.com/[username]/[tag-database-repo].git
```

## 🎯 What Makes a Good External Source?

✅ Large number of tags (1000+)
✅ Has aliases/synonyms
✅ Cross-site mappings
✅ Actively maintained
✅ Easy to parse format (JSON/CSV)
✅ Public/free to use

❌ Outdated data
❌ Complex parsing required
❌ Limited tag coverage
❌ No synonym information

## 📊 Current Status

- **EhTagTranslation**: ✅ Integrated (1,281 tags)
- **External Sources**: Ready for integration

When you add files here, they'll be automatically processed!

