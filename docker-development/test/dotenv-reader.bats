#!/usr/bin/env bats
# dotenv reader: KEY=VALUE without eval/source.

setup() {
  load 'helpers/test-helper'
  load_bats_libs
  setup_sandbox
  # shellcheck source=../lib/common.sh
  . "$DEV_ROOT/lib/common.sh"
  # shellcheck source=../lib/dotenv-reader.sh
  . "$DEV_ROOT/lib/dotenv-reader.sh"
  F="$SANDBOX/x.env"
}

@test "quotes, = in values, export prefix and inline comments" {
  cat >"$F" <<'ENV'
# comment
A=plain
B='single quoted # not a comment'
C="double quoted"
export D=exported
E=k=v=w
F=value # trailing comment
  G=indented
lower=ignored
H=
ENV
  run dotenv_get "$F" A; assert_output plain
  run dotenv_get "$F" B; assert_output 'single quoted # not a comment'
  run dotenv_get "$F" C; assert_output 'double quoted'
  run dotenv_get "$F" D; assert_output exported
  run dotenv_get "$F" E; assert_output 'k=v=w'
  run dotenv_get "$F" F; assert_output value
  run dotenv_get "$F" G; assert_output indented
  run dotenv_get "$F" H; assert_success; assert_output ''
  run dotenv_get "$F" NOPE; assert_success; assert_output ''
  run dotenv_keys "$F"
  assert_output "A
B
C
D
E
F
G
H"
}

@test "a value containing a single quote dies and names the key" {
  printf "OK=1\nBAD=\"it's\"\n" >"$F"
  run dotenv_get "$F" OK
  assert_failure
  assert_output --partial "BAD"
}

@test "a multi-line (unterminated) quoted value dies and names the key" {
  printf 'ML="line one\nline two"\n' >"$F"
  run dotenv_get "$F" ML
  assert_failure
  assert_output --partial "ML"
}

@test "a missing file reads as empty" {
  run dotenv_get "$SANDBOX/none.env" A
  assert_success
  assert_output ''
  run dotenv_keys "$SANDBOX/none.env"
  assert_success
  assert_output ''
}
