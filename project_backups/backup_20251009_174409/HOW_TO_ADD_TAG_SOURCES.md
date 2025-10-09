# 🔍 How to Find and Add External Tag Sources

This guide explains what to search for on GitHub to enhance the tag synonym system.

## 🎯 Quick Start - What to Search

### On GitHub:

1. **Booru Tag Databases**
   ```
   site:github.com danbooru tag aliases
   site:github.com gelbooru tag database
   site:github.com "tag implications" booru
   ```

2. **Hentai/Manga Specific**
   ```
   site:github.com nhentai tag mapping
   site:github.com e-hentai tag synonyms
   site:github.com hitomi tag database
   site:github.com doujin tag metadata
   ```

3. **Cross-Platform Tag Systems**
   ```
   site:github.com "cross site" tag mapping anime
   site:github.com tag normalization hentai
   site:github.com multi-source tag aggregator
   ```

## 📦 Recommended Repositories to Look For

### High Priority:

1. **`danbooru/danbooru`**
   - Has extensive tag alias system
   - File to look for: `db/seeds/tag_aliases.csv` or similar
   - May have JSON exports

2. **Gelbooru Tag Tools**
   - Search: `gelbooru tag` on GitHub
   - Look for tag export scripts or databases

3. **Tag Translation Projects**
   - Already have: EhTagTranslation ✅
   - Similar projects for other sites

### What Files to Extract:

✅ `tag_aliases.json`
✅ `tag_implications.csv`
✅ `tag_mappings.txt`
✅ `synonyms.json`
✅ Any file with tag relationships

## 🚀 How to Use Found Sources

### Method 1: Download Direct Files

If you find a direct tag file:

```bash
# Example: Danbooru tag aliases
cd "/mnt/c/webui/search repos/external"
curl -o danbooru-tags.json https://raw.githubusercontent.com/[user]/[repo]/main/tags.json
```

### Method 2: Clone Repository

If it's a full repository:

```bash
cd "/mnt/c/webui/search repos/external"
git clone --depth 1 https://github.com/[user]/[repo-name].git
```

### Method 3: Manual Download

1. Find the file on GitHub
2. Click "Raw" button
3. Save as `.json`, `.csv`, or `.txt`
4. Place in `/mnt/c/webui/search repos/external/`

## 📝 Supported Formats

### JSON (Best)
```json
{
  "femdom": {
    "aliases": ["female domination", "fem dom"],
    "category": "female"
  }
}
```

### CSV (Good)
```csv
femdom,female domination,fem dom
futanari,futa,dickgirl
```

### TXT (Simple)
```txt
femdom = female domination, fem dom
futanari = futa, dickgirl
```

## ⚙️ After Adding Files

1. **Check the files are in place:**
   ```bash
   ls "/mnt/c/webui/search repos/external/"
   ```

2. **Regenerate synonyms:**
   ```bash
   npm run generate-tag-synonyms
   ```

3. **Restart the dev server:**
   ```bash
   npm run dev
   ```

## 💡 Example Workflow

```bash
# 1. Find a repo with tag data
# Example: https://github.com/example/booru-tags

# 2. Clone or download
cd "/mnt/c/webui/search repos/external"
git clone https://github.com/example/booru-tags.git

# 3. If the repo has a specific tag file
cp booru-tags/data/aliases.json ./booru-aliases.json

# 4. Regenerate
cd /mnt/c/webui
npm run generate-tag-synonyms

# Done! Your synonyms now include the external source
```

## 🔎 Specific Sites to Check

### Danbooru
- Site: https://danbooru.donmai.us/
- GitHub: https://github.com/danbooru
- Look for: Tag alias exports, API endpoints

### Gelbooru
- May have tag APIs or exports
- Search GitHub for community tools

### E-Hentai
- Already integrated via EhTagTranslation ✅

### Nhentai
- Search for nhentai scrapers/tools
- Often include tag mappings

## 📊 What Makes a Good Source?

✅ **10,000+ tags** - Large coverage
✅ **Aliases included** - Has synonym data
✅ **Multiple categories** - female/male/mixed etc.
✅ **Cross-site mappings** - Shows how tags relate across sites
✅ **Recent/maintained** - Up to date data
✅ **Easy format** - JSON, CSV, or simple text

## 🎯 Best Sources (Priority Order)

1. **Danbooru tag database** - Most comprehensive
2. **Gelbooru community tools** - Good coverage
3. **Site-specific scrapers** - Often include tag mappings
4. **Community tag translation projects** - Like EhTagTranslation
5. **Aggregator projects** - Multi-source tag databases

## 📍 Examples of Good Finds

If you find repos like:
- `awesome-booru-tags`
- `anime-tag-database`
- `hentai-metadata-project`
- `tag-translation-database`
- `cross-platform-tag-mapper`

These are likely goldmines!

## ❓ Can't Find Sources?

The system already works with:
- ✅ EhTagTranslation (1,281 tags)
- ✅ Auto-generated variations
- ✅ Cross-category matching
- ✅ Similarity detection

It's functional now, but external sources will make it even better!

## 🤝 Share What You Find

When you find good sources, you can:
1. Add them locally (as described above)
2. The synonym database auto-regenerates
3. Your searches become smarter instantly!

---

**Ready to enhance the system?** Start searching GitHub now! 🚀

