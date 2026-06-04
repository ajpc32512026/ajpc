import json
import os
import re
import sys

# Ensure the spellchecker library is installed
try:
    from spellchecker import SpellChecker
except ImportError:
    print("Error: The 'pyspellchecker' library is required.")
    print("Please install it by running: pip install pyspellchecker")
    sys.exit(1)

# Initialize the spell checker
spell = SpellChecker()

# Whitelist of correct words, culinary terms, and common abbreviations
general_whitelist = {
    # Measurements, Units, & Technical Terms
    "g", "ml", "tsp", "tbsp", "kg", "l", "c", "cm", "mm", "temp", "approx", "mins", "qty",
    "hr", "hrs", "wattages", "pre", "un", "lg", "bbq", "https", "http", "www",
    # Correct words often flagged by default US English dictionaries
    "chilli", "chillies", "colour", "colours", "flavour", "flavours", "savoury", 
    "organise", "organised", "minimise", "maximise", "caramelise", "caramelised",
    "centre", "centres", "centrepiece", "litre", "litres", "tenderise", "tenderises",
    "tenderised", "tenderising", "favourite", "favourites", "flavourful", "flavoured",
    "colouring", "colourful", "savouries", "savouriness", "gelatinises", "customise",
    "passionfruit", "passionfruits", "cafe", "cafes", "carb", "carbs", "sauvignon",
    # Standard ethnic/culinary terms
    "roti", "garam", "masala", "bleu", "cheong", "freekeh", "psyllium", "quinoa", 
    "maltodextrin", "doner", "rogan", "josh", "vindaloo", "stovetop", "panko",
    "mascarpone", "kalamata", "hoisin", "basmati", "emmental", "gruyere",
    "sambal", "oelek", "sriracha", "umami", "beurre", "gelatin", "nutella", 
    "ganoush", "labneh", "poolish", "nigella"
}

recipe_files = [
    r"D:\mysites\ajpc\data\recipes\alfredosauce.json",
    r"D:\mysites\ajpc\data\recipes\ananaschiavanillapudding.json",
    r"D:\mysites\ajpc\data\recipes\applecinnscrolls.json",
    r"D:\mysites\ajpc\data\recipes\applepie.json",
    r"D:\mysites\ajpc\data\recipes\applestrudel.json",
    r"D:\mysites\ajpc\data\recipes\apricotchicken.json",
    r"D:\mysites\ajpc\data\recipes\apricotflan.json",
    r"D:\mysites\ajpc\data\recipes\arrabbiatasauce.json",
    r"D:\mysites\ajpc\data\recipes\baked-cheesecake.json",
    r"D:\mysites\ajpc\data\recipes\bananabread.json",
    r"D:\mysites\ajpc\data\recipes\bananacake.json",
    r"D:\mysites\ajpc\data\recipes\beefstockpot.json",
    r"D:\mysites\ajpc\data\recipes\beefstroganoff.json",
    r"D:\mysites\ajpc\data\recipes\beefvindaloo.json",
    r"D:\mysites\ajpc\data\recipes\bistro-brandymustardsteak.json",
    r"D:\mysites\ajpc\data\recipes\bistro-carpetbag.json",
    r"D:\mysites\ajpc\data\recipes\bistro-chickenkiev.json",
    r"D:\mysites\ajpc\data\recipes\bistro-chickenpapion.json",
    r"D:\mysites\ajpc\data\recipes\bistro-chickenpicante.json",
    r"D:\mysites\ajpc\data\recipes\bistro-chickenriverina.json",
    r"D:\mysites\ajpc\data\recipes\bistro-demiglace.json",
    r"D:\mysites\ajpc\data\recipes\bistro-filetmignon.json",
    r"D:\mysites\ajpc\data\recipes\bistro-fishoftheday.json",
    r"D:\mysites\ajpc\data\recipes\bistro-lambcutlets.json",
    r"D:\mysites\ajpc\data\recipes\bistro-mediterraneansteak.json",
    r"D:\mysites\ajpc\data\recipes\bistro-orangethaichicken.json",
    r"D:\mysites\ajpc\data\recipes\bistro-pavlova.json",
    r"D:\mysites\ajpc\data\recipes\bistro-profiteroles.json",
    r"D:\mysites\ajpc\data\recipes\bistro-rackoflamb.json",
    r"D:\mysites\ajpc\data\recipes\bistro-reefandbeef.json",
    r"D:\mysites\ajpc\data\recipes\bistro-steakboston.json",
    r"D:\mysites\ajpc\data\recipes\bistro-thaichicken.json",
    r"D:\mysites\ajpc\data\recipes\bistro-vealcordonbleu.json",
    r"D:\mysites\ajpc\data\recipes\bistro-vealmadagascar.json",
    r"D:\mysites\ajpc\data\recipes\bistro-vealmozzarella.json",
    r"D:\mysites\ajpc\data\recipes\bistro-vealoscar.json",
    r"D:\mysites\ajpc\data\recipes\bistro-vealscaloppine.json",
    r"D:\mysites\ajpc\data\recipes\blueberrymuffins.json",
    r"D:\mysites\ajpc\data\recipes\bulalo.json",
    r"D:\mysites\ajpc\data\recipes\butterchicken.json",
    r"D:\mysites\ajpc\data\recipes\cherrycoconutcake.json",
    r"D:\mysites\ajpc\data\recipes\chickencacciatore.json",
    r"D:\mysites\ajpc\data\recipes\chickenmushroombaconpies.json",
    r"D:\mysites\ajpc\data\recipes\chickenpineapple.json",
    r"D:\mysites\ajpc\data\recipes\chickenshawarma.json",
    r"D:\mysites\ajpc\data\recipes\chickenteriyaki.json",
    r"D:\mysites\ajpc\data\recipes\chilligarlicoil.json",
    r"D:\mysites\ajpc\data\recipes\chocmuffins.json",
    r"D:\mysites\ajpc\data\recipes\chocolatemousse.json",
    r"D:\mysites\ajpc\data\recipes\chocolatemugcake.json",
    r"D:\mysites\ajpc\data\recipes\chocolaterumballs.json",
    r"D:\mysites\ajpc\data\recipes\chouxpastry.json",
    r"D:\mysites\ajpc\data\recipes\cinnbun.json",
    r"D:\mysites\ajpc\data\recipes\cinntwists.json",
    r"D:\mysites\ajpc\data\recipes\classiccarrotcake.json",
    r"D:\mysites\ajpc\data\recipes\cremecaramel.json",
    r"D:\mysites\ajpc\data\recipes\crepes.json",
    r"D:\mysites\ajpc\data\recipes\currychicken.json",
    r"D:\mysites\ajpc\data\recipes\darkrye.json",
    r"D:\mysites\ajpc\data\recipes\doublechocolatechipcookies.json",
    r"D:\mysites\ajpc\data\recipes\filipinonoodles.json",
    r"D:\mysites\ajpc\data\recipes\filipinoportoccino.json",
    r"D:\mysites\ajpc\data\recipes\focaccia.json",
    r"D:\mysites\ajpc\data\recipes\focaccia-high.json",
    r"D:\mysites\ajpc\data\recipes\friandsop.json",
    r"D:\mysites\ajpc\data\recipes\garlicbread.json",
    r"D:\mysites\ajpc\data\recipes\hamburger.json",
    r"D:\mysites\ajpc\data\recipes\highhydraciab.json",
    r"D:\mysites\ajpc\data\recipes\honeygarlicsauce.json",
    r"D:\mysites\ajpc\data\recipes\honeysoychicken.json",
    r"D:\mysites\ajpc\data\recipes\hotdog.json",
    r"D:\mysites\ajpc\data\recipes\hummingbird.json",
    r"D:\mysites\ajpc\data\recipes\kormapaste.json",
    r"D:\mysites\ajpc\data\recipes\lambkorma.json",
    r"D:\mysites\ajpc\data\recipes\lambvindaloo.json",
    r"D:\mysites\ajpc\data\recipes\lamington.json",
    r"D:\mysites\ajpc\data\recipes\lasagne.json",
    r"D:\mysites\ajpc\data\recipes\lemoncoconut.json",
    r"D:\mysites\ajpc\data\recipes\lemonmeringuepie.json",
    r"D:\mysites\ajpc\data\recipes\marinarasauce.json",
    r"D:\mysites\ajpc\data\recipes\meatpie.json",
    r"D:\mysites\ajpc\data\recipes\mongolianbeef.json",
    r"D:\mysites\ajpc\data\recipes\mongolianlamb.json",
    r"D:\mysites\ajpc\data\recipes\mongoliansauce.json",
    r"D:\mysites\ajpc\data\recipes\mornaysauce.json",
    r"D:\mysites\ajpc\data\recipes\muffinmix.json",
    r"D:\mysites\ajpc\data\recipes\mushroomcups.json",
    r"D:\mysites\ajpc\data\recipes\nachomince.json",
    r"D:\mysites\ajpc\data\recipes\orangepoppyseed.json",
    r"D:\mysites\ajpc\data\recipes\pancakesfortwo.json",
    r"D:\mysites\ajpc\data\recipes\pancitbihon.json",
    r"D:\mysites\ajpc\data\recipes\pancitcanton.json",
    r"D:\mysites\ajpc\data\recipes\pestosauce.json",
    r"D:\mysites\ajpc\data\recipes\pineappleupsidedowncake.json",
    r"D:\mysites\ajpc\data\recipes\pizzadough.json",
    r"D:\mysites\ajpc\data\recipes\plaincheesecakeclassicnobake.json",
    r"D:\mysites\ajpc\data\recipes\porkcaldereta.json",
    r"D:\mysites\ajpc\data\recipes\potatognocchi.json",
    r"D:\mysites\ajpc\data\recipes\puffpastryrough.json",
    r"D:\mysites\ajpc\data\recipes\puffpastrytraditional.json",
    r"D:\mysites\ajpc\data\recipes\redsauce.json",
    r"D:\mysites\ajpc\data\recipes\roganjosh.json",
    r"D:\mysites\ajpc\data\recipes\roulade.json",
    r"D:\mysites\ajpc\data\recipes\sataysauce.json",
    r"D:\mysites\ajpc\data\recipes\sausageroll.json",
    r"D:\mysites\ajpc\data\recipes\sourdoughcinnrolls.json",
    r"D:\mysites\ajpc\data\recipes\stickydates.json",
    r"D:\mysites\ajpc\data\recipes\sub.json",
    r"D:\mysites\ajpc\data\recipes\swbtm.json",
    r"D:\mysites\ajpc\data\recipes\swbtm2.json",
    r"D:\mysites\ajpc\data\recipes\sweetchilisauce.json",
    r"D:\mysites\ajpc\data\recipes\sweetchillisauce.json",
    r"D:\mysites\ajpc\data\recipes\sweetsourpork.json",
    r"D:\mysites\ajpc\data\recipes\sweetsoursauce_flex.json",
    r"D:\mysites\ajpc\data\recipes\sweetsoursauce_quick.json",
    r"D:\mysites\ajpc\data\recipes\sweetspicyorangesauce.json",
    r"D:\mysites\ajpc\data\recipes\tacoseasoning.json",
    r"D:\mysites\ajpc\data\recipes\tangzhongseed.json",
    r"D:\mysites\ajpc\data\recipes\teriyakimarinade.json",
    r"D:\mysites\ajpc\data\recipes\teriyakisauce.json",
    r"D:\mysites\ajpc\data\recipes\theultimatechocolatemudcake.json",
    r"D:\mysites\ajpc\data\recipes\tiramisu.json",
    r"D:\mysites\ajpc\data\recipes\tomatoflan.json",
    r"D:\mysites\ajpc\data\recipes\traditionalanzacbiscuits.json",
    r"D:\mysites\ajpc\data\recipes\turkishbread.json",
    r"D:\mysites\ajpc\data\recipes\vindaloopaste.json",
    r"D:\mysites\ajpc\data\recipes\whitesauce.json"
]

# Generate recipe names to ignore
recipe_base_names = set()
for path in recipe_files:
    base_name = os.path.splitext(os.path.basename(path))[0].lower()
    recipe_base_names.add(base_name)
    # Also add the name without hyphens/underscores
    recipe_base_names.add(base_name.replace("-", "").replace("_", ""))

# Update the spellchecker dictionary with our static whitelist
spell.word_frequency.load_words(general_whitelist)

def is_related_to_filename(word, base_names):
    """
    Returns True if the word is part of a filename, contains a filename,
    or matches a plural/singular variation of a filename.
    """
    word_lower = word.lower()
    
    for base in base_names:
        # 1. Exact match
        if word_lower == base:
            return True
        
        # 2. Word is a portion of a filename (e.g., 'arrabbiata' is inside 'arrabbiatasauce')
        # We only check for lengths >= 3 to prevent ignoring common 1 or 2 letter words
        if len(word_lower) >= 3 and word_lower in base:
            return True
            
        # 3. Filename is inside the word (e.g., 'butterchicken' is inside 'restaurantstylebutterchicken')
        if len(base) >= 3 and base in word_lower:
            return True
            
        # 4. Plural check (e.g., 'lamingtons' ends with 's' and matches base 'lamington')
        if word_lower.endswith("s") and word_lower[:-1] == base:
            return True
        if word_lower.endswith("es") and word_lower[:-2] == base:
            return True
            
    return False

def extract_text_values(data):
    """Recursively extracts string values from JSON elements."""
    strings = []
    if isinstance(data, dict):
        for val in data.values():
            strings.extend(extract_text_values(val))
    elif isinstance(data, list):
        for item in data:
            strings.extend(extract_text_values(item))
    elif isinstance(data, str):
        strings.append(data)
    return strings

def check_spelling_in_file(file_path):
    if not os.path.exists(file_path):
        return None, "File not found"
    
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            data = json.load(f)
    except Exception as e:
        return None, f"Could not parse JSON: {e}"
    
    text_list = extract_text_values(data)
    combined_text = " ".join(text_list)
    
    # Capture standard words and words with internal apostrophes (like "women's" or "doesn't")
    raw_words = re.findall(r"\b[a-zA-Z]+(?:'[a-zA-Z]+)?\b", combined_text)
    
    processed_words = []
    for word in raw_words:
        word_lower = word.lower()
        
        # Skip web addresses
        if any(indicator in word_lower for indicator in ["http", "www", "html", "com"]):
            continue
            
        # Clean possessives like "women's" -> "women"
        if word_lower.endswith("'s"):
            word_lower = word_lower[:-2]
            
        processed_words.append(word_lower)

    # Find unrecognized words
    misspelled = spell.unknown(processed_words)
    
    # Filter out whitelisted words and words matching filename substrings
    filtered_misspelled = []
    for w in misspelled:
        if w in general_whitelist:
            continue
        if is_related_to_filename(w, recipe_base_names):
            continue
        filtered_misspelled.append(w)
        
    return set(filtered_misspelled), None

# Run spelling check on all files
print("Scanning JSON files for spelling errors...")
files_with_errors = 0

for path in recipe_files:
    filename = os.path.basename(path)
    misspelled_words, error = check_spelling_in_file(path)
    
    if error:
        if error == "File not found":
            print(f"[{filename}] Warning: File not found")
        else:
            print(f"[{filename}] Error: {error}")
        continue
    
    if misspelled_words:
        files_with_errors += 1
        words_list = ", ".join(sorted(list(misspelled_words)))
        print(f"[{filename}] Potential misspellings: {words_list}")

if files_with_errors == 0:
    print("\nNo spelling issues detected based on the current dictionary rules.")
else:
    print(f"\nScan complete. Found spelling warnings in {files_with_errors} file(s).")