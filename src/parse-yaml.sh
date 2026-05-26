#!/usr/bin/env bash
# parse-yaml.sh — Extract values from swarm.yaml using python3 (available on macOS + Linux)
# Usage: source parse-yaml.sh; parse_yaml "path/to/swarm.yaml"

parse_yaml_value() {
  local file="$1" key="$2" default="${3:-}"
  python3 -c "
import yaml, sys
try:
    with open('$file') as f: d = yaml.safe_load(f)
    keys = '$key'.split('.')
    v = d
    for k in keys:
        if isinstance(v, list):
            v = v[int(k)]
        else:
            v = v[k]
    print(v if v is not None else '$default')
except Exception:
    print('$default')
" 2>/dev/null
}

parse_yaml_list_len() {
  local file="$1" key="$2"
  python3 -c "
import yaml
try:
    with open('$file') as f: d = yaml.safe_load(f)
    keys = '$key'.split('.')
    v = d
    for k in keys:
        if isinstance(v, list):
            v = v[int(k)]
        else:
            v = v[k]
    print(len(v) if isinstance(v, list) else 0)
except Exception:
    print(0)
" 2>/dev/null
}

# Full VP extraction: returns JSON array of VPs
parse_vps_json() {
  local file="$1"
  python3 -c "
import yaml, json
with open('$file') as f: d = yaml.safe_load(f)
vps = d.get('vps', [])
result = []
for i, vp in enumerate(vps):
    result.append({
        'index': i,
        'role': vp.get('role', f'VP {i}'),
        'pane': vp.get('pane', i + 1),
        'prompt': vp.get('prompt', '').strip(),
        'model': vp.get('model', 'sonnet'),
        'workdir': vp.get('workdir', '.'),
        'depends_on': vp.get('depends_on', []),
        'outputs': vp.get('outputs', []),
    })
print(json.dumps(result))
" 2>/dev/null
}

# Validate a swarm.yaml file
validate_yaml() {
  local file="$1"
  local errors=0

  if [ ! -f "$file" ]; then
    echo "ERROR: File not found: $file"
    return 1
  fi

  # Check python3 + pyyaml
  if ! python3 -c "import yaml" 2>/dev/null; then
    echo "ERROR: python3 with PyYAML is required. Install: pip3 install pyyaml"
    return 1
  fi

  local valid
  valid=$(python3 -c "
import yaml, sys, json
try:
    with open('$file') as f: d = yaml.safe_load(f)
    errors = []
    if 'swarm' not in d: errors.append('Missing top-level \"swarm\" key')
    else:
        if 'name' not in d['swarm']: errors.append('swarm.name is required')
        if 'session' not in d['swarm']: errors.append('swarm.session is required')
    if 'ceo' not in d: errors.append('Missing \"ceo\" key')
    else:
        if 'prompt' not in d['ceo']: errors.append('ceo.prompt is required')
    if 'vps' not in d: errors.append('Missing \"vps\" key')
    elif not isinstance(d['vps'], list): errors.append('\"vps\" must be a list')
    elif len(d['vps']) == 0: errors.append('\"vps\" list is empty')
    else:
        roles = set()
        for i, vp in enumerate(d['vps']):
            if 'role' not in vp: errors.append(f'vps[{i}].role is required')
            elif vp['role'] in roles: errors.append(f'Duplicate role: {vp[\"role\"]}')
            else: roles.add(vp['role'])
            if 'prompt' not in vp: errors.append(f'vps[{i}].prompt is required')
            for dep in vp.get('depends_on', []):
                if dep not in roles and dep not in [v.get('role') for v in d['vps']]:
                    pass  # allow forward references
    if errors:
        for e in errors: print(f'ERROR: {e}')
        sys.exit(1)
    else:
        print('OK')
except yaml.YAMLError as e:
    print(f'ERROR: Invalid YAML: {e}')
    sys.exit(1)
" 2>&1)

  echo "$valid"
  [[ "$valid" == "OK" ]]
}
