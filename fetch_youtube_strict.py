import json
import subprocess
import time
import re
import unicodedata

CHANNELS_LOWER = [
    "choeur montjoie saint denis", 
    "chœur montjoie saint denis",
    "choeur montjoie",
    "sapiens france", 
    "les padrés",
    "les padres"
]

def clean_string(s):
    s = s.lower()
    s = ''.join(c for c in unicodedata.normalize('NFD', s) if unicodedata.category(c) != 'Mn')
    return re.sub(r'[^a-z0-9\s]', '', s).strip()

def is_title_match(song_title, video_title):
    s_clean = clean_string(song_title)
    v_clean = clean_string(video_title)
    
    # If the clean song title is a direct substring of the video title
    if s_clean in v_clean:
        return True
        
    s_words = s_clean.split()
    if not s_words:
        return False
        
    # Check word match ratio
    matched_words = [w for w in s_words if w in v_clean]
    if len(s_words) <= 2:
        # For short titles like "Le Cor", we want all words to match
        return len(matched_words) == len(s_words)
    else:
        # For longer titles, allow 75% match
        return (len(matched_words) / len(s_words)) >= 0.75

def search_strict(title):
    query = f"{title} (Choeur Montjoie OR Sapiens France OR Les Padrés)"
    print(f"Searching: {title}")
    try:
        cmd = ['yt-dlp', f'ytsearch10:{query}', '--dump-json', '--no-warnings', '--flat-playlist']
        result = subprocess.run(cmd, capture_output=True, text=True, encoding='utf-8', errors='ignore')
        
        lines = result.stdout.strip().split('\n')
        for line in lines:
            if not line: continue
            try:
                data = json.loads(line)
                uploader = data.get('uploader', '').lower()
                channel = data.get('channel', '').lower()
                video_title = data.get('title', '')
                
                # Check if uploader or channel matches
                channel_match = False
                for c in CHANNELS_LOWER:
                    if c in uploader or c in channel:
                        channel_match = True
                        break
                        
                if channel_match:
                    if is_title_match(title, video_title):
                        print(f"  -> MATCHED video: {video_title} ({data.get('id')})")
                        return data.get('id')
                    else:
                        print(f"  -> Skipped (title mismatch): {video_title}")
            except Exception as ex:
                pass
    except Exception as e:
        print("Error:", e)
    return None

with open('public/songs-index.js', 'r', encoding='utf-8') as f:
    content = f.read()
    json_str = content.split('=', 1)[1].strip().rstrip(';')
    songs = json.loads(json_str)

audio_map = {}
count = 0

for song in songs:
    page = str(song['page'])
    title = song['title']
    
    vid = search_strict(title)
    if vid:
        print(f"Found strict match for {title}: {vid}")
        if page not in audio_map:
            audio_map[page] = []
        audio_map[page].append({
            "title": title,
            "youtubeId": vid
        })
        count += 1
    else:
        print(f"No strict match for {title}")
        
    # save incrementally
    with open('public/audio-map.js', 'w', encoding='utf-8') as f:
        f.write('window.audio_map_data = ' + json.dumps(audio_map, ensure_ascii=False, indent=2) + ';')

print(f"Done. Found {count} exact matches.")
