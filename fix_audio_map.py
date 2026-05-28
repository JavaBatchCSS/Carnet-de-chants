import json
import re

with open('public/songs-index.js', 'r', encoding='utf-8') as f:
    text = f.read()
    songs_data = json.loads(text.replace('window.songs_index_data = ', '').rstrip().rstrip(';'))

with open('public/audio-map.js', 'r', encoding='utf-8') as f:
    text = f.read()
    audio_map = json.loads(text.replace('window.audio_map_data = ', '').rstrip().rstrip(';'))

def clean_text(t):
    return re.sub(r'[^a-z0-9]', '', t.lower())

title_to_new_id = {clean_text(s['title']): str(s['page']) for s in songs_data}

new_audio_map = {}
for old_id, audio_entries in audio_map.items():
    # An old_id can have multiple songs on it.
    for entry in audio_entries:
        ctitle = clean_text(entry['title'])
        new_id = title_to_new_id.get(ctitle)
        if new_id:
            if new_id not in new_audio_map:
                new_audio_map[new_id] = []
            new_audio_map[new_id].append(entry)
        else:
            # If we can't find it, just keep the old ID as fallback
            if old_id not in new_audio_map:
                new_audio_map[old_id] = []
            new_audio_map[old_id].append(entry)

with open('public/audio-map.js', 'w', encoding='utf-8') as f:
    f.write(f"window.audio_map_data = {json.dumps(new_audio_map, ensure_ascii=False, indent=2)};\n")

print("Fixed audio-map.js IDs")
