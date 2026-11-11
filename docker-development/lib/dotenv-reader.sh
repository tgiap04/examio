# KEY=VALUE files read as data: never eval'd or sourced. bash 3.2 safe.
#   KEY=value, KEY='value', KEY="value", `export KEY=...`; one pair of outer quotes is removed;
#   an unquoted value loses a trailing ` # comment` and surrounding spaces. Keys: ^[A-Z][A-Z0-9_]*.
# Every generated file quotes values with single quotes, so a value holding ' (or spanning lines) is refused.
# shellcheck shell=bash

# _dotenv_parse <file>: "KEY<TAB>VALUE" lines; dies (naming the key, never the value) on a bad value.
_dotenv_parse() {
  local file="$1" line key val q
  [ -f "$file" ] || return 0
  while IFS= read -r line || [ -n "$line" ]; do
    line="${line#"${line%%[![:space:]]*}"}"
    case "$line" in '' | '#'*) continue ;; esac
    line="${line#export }"
    [[ "$line" =~ ^[A-Z][A-Z0-9_]*= ]] || continue
    key="${line%%=*}"
    val="${line#*=}"
    q="${val:0:1}"
    if [ "$q" = "'" ] || [ "$q" = '"' ]; then
      val="${val#"$q"}"
      val="${val%"${val##*[![:space:]]}"}"
      case "$val" in
        *"$q") val="${val%"$q"}" ;;
        *) die "$file: $key has an unterminated quote (multi-line values are not supported)" ;;
      esac
    else
      case "$val" in *' #'*) val="${val%% #*}" ;; esac
      val="${val%"${val##*[![:space:]]}"}"
    fi
    case "$val" in *"'"*) die "$file: the value of $key contains a single quote (not supported)" ;; esac
    printf '%s\t%s\n' "$key" "$val"
  done <"$file"
}

# dotenv_get <file> <key>: the value (first occurrence), empty when absent. Missing file = empty.
dotenv_get() {
  local parsed k v
  parsed="$(_dotenv_parse "$1")" || exit 1
  while IFS=$'\t' read -r k v; do
    if [ "$k" = "$2" ]; then printf '%s\n' "$v"; return 0; fi
  done <<<"$parsed"
  printf '\n'
}

# dotenv_keys <file>: keys in file order, one per line.
dotenv_keys() {
  local parsed
  parsed="$(_dotenv_parse "$1")" || exit 1
  [ -z "$parsed" ] || printf '%s\n' "$parsed" | cut -f1
}
