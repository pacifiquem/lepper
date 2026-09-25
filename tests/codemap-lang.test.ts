import { afterEach, describe, expect, it } from 'vitest';
import { blastRadius, codeMap } from '../src/codemap';
import {
  keywordsForExtension,
  supportedExtensions,
} from '../src/codemap/languages/registry';
import { createTempDir, removeTempDir } from './helpers';
import fs from 'fs';
import path from 'path';

const dirs: string[] = [];

afterEach(() => {
  while (dirs.length) {
    const dir = dirs.pop();
    if (dir) {
      removeTempDir(dir);
    }
  }
});

function write(root: string, relative: string, body: string): void {
  const absolute = path.join(root, relative);
  fs.mkdirSync(path.dirname(absolute), { recursive: true });
  fs.writeFileSync(absolute, body);
}

function callerCalls(root: string, file: string, name: string): string[] {
  const symbol = codeMap(root).symbols.find(
    (item) => item.path === file && item.name === name,
  );
  return (symbol?.calls || []).map((call) => call.name).sort();
}

describe('language keyword tables', () => {
  it('gives every supported extension its own keyword list', () => {
    expect(supportedExtensions.length).toBeGreaterThan(10);
    for (const ext of supportedExtensions) {
      expect(keywordsForExtension(ext).length).toBeGreaterThan(5);
    }
    expect(keywordsForExtension('.java')).toContain('import');
    expect(keywordsForExtension('.cs')).toContain('namespace');
    expect(keywordsForExtension('.c')).toContain('return');
    expect(keywordsForExtension('.cpp')).toContain('template');
    expect(keywordsForExtension('.h')).toContain('struct');
    expect(keywordsForExtension('.go')).toContain('func');
    expect(keywordsForExtension('.rs')).toContain('fn');
    expect(keywordsForExtension('.sh')).toContain('fi');
    expect(keywordsForExtension('.ps1')).toContain('elseif');
    expect(keywordsForExtension('.sql')).toContain('procedure');
    expect(keywordsForExtension('.ex')).toContain('defmodule');
    expect(keywordsForExtension('.erl')).toContain('andalso');
    expect(keywordsForExtension('.html')).toContain('script');
    expect(keywordsForExtension('.css')).toContain('import');
  });
});

describe('code map and blast radius by language', () => {
  it('links Java, C#, C, and C++ calls and ignores keywords', () => {
    const root = createTempDir();
    dirs.push(root);
    write(
      root,
      'src/app/Auth.java',
      `package app;
public class Auth {
  public static boolean check(String header) {
    return header != null;
  }
}
`,
    );
    write(
      root,
      'src/app/Login.java',
      `package app;
import app.Auth;
public class Login {
  public String handle(String header) {
    if (header == null) {
      return null;
    }
    return Auth.check(header);
  }
}
`,
    );
    write(
      root,
      'src/Auth.cs',
      `namespace App {
  public class Auth {
    public static bool Check(string header) {
      return header != null;
    }
  }
}
`,
    );
    write(
      root,
      'src/Login.cs',
      `using App;
namespace App.Http {
  public class Login {
    public string Handle(string header) {
      if (header == null) {
        return null;
      }
      return Auth.Check(header);
    }
  }
}
`,
    );
    write(
      root,
      'src/auth.h',
      `#ifndef AUTH_H
#define AUTH_H
int check(const char *header);
#endif
`,
    );
    write(
      root,
      'src/auth.c',
      `#include "auth.h"
int check(const char *header) {
  return header != 0;
}
`,
    );
    write(
      root,
      'src/http.c',
      `#include "auth.h"
int handle(const char *header) {
  if (!header) {
    return 0;
  }
  return check(header);
}
`,
    );
    write(
      root,
      'src/auth.hpp',
      `#pragma once
int check_cpp(const char *header);
`,
    );
    write(
      root,
      'src/auth.cpp',
      `#include "auth.hpp"
int check_cpp(const char *header) {
  return header != 0;
}
`,
    );
    write(
      root,
      'src/http.cpp',
      `#include "auth.hpp"
int handle_cpp(const char *header) {
  if (!header) {
    return 0;
  }
  return check_cpp(header);
}
`,
    );

    expect(callerCalls(root, './src/app/Login.java', 'handle')).toEqual([
      'Auth.check',
    ]);
    expect(callerCalls(root, './src/Login.cs', 'Handle')).toEqual([
      'Auth.Check',
    ]);
    expect(callerCalls(root, './src/http.c', 'handle')).toEqual(['check']);
    expect(callerCalls(root, './src/http.cpp', 'handle_cpp')).toEqual([
      'check_cpp',
    ]);
    expect(
      blastRadius(root, 'src/auth.c#check').dependents.map((item) => item.name),
    ).toContain('handle');
    expect(
      blastRadius(root, 'src/Auth.cs#Check').dependents.map(
        (item) => item.name,
      ),
    ).toContain('Login.Handle');
  });

  it('links shell, PowerShell, SQL, Go, and Rust', () => {
    const root = createTempDir();
    dirs.push(root);
    write(
      root,
      'src/auth.sh',
      `check() {
  return 0
}
`,
    );
    write(
      root,
      'src/http.sh',
      `source ./auth.sh
handle() {
  if test "$1" = ""; then
    return 1
  fi
  check "$1"
}
`,
    );
    write(
      root,
      'src/auth.ps1',
      `function Get-Token {
  param($User)
  return $User
}
`,
    );
    write(
      root,
      'src/http.ps1',
      `. ./auth.ps1
function Invoke-Login {
  if ($true) {
    Get-Token -User "ada"
  }
}
`,
    );
    write(
      root,
      'src/check.sql',
      `CREATE FUNCTION check_header(header text)
RETURNS boolean AS $$
BEGIN
  RETURN true;
END;
$$;
`,
    );
    write(
      root,
      'src/login.sql',
      `CREATE FUNCTION handle_login(header text)
RETURNS boolean AS $$
BEGIN
  RETURN check_header(header);
END;
$$;
`,
    );
    write(
      root,
      'src/demo.go',
      `package demo

func Connect() int {
    return 1
}

func Load() int {
    if false {
        return Connect()
    }
    return 0
}
`,
    );
    write(
      root,
      'src/auth.rs',
      `pub fn check() {}
`,
    );
    write(
      root,
      'src/http.rs',
      `mod auth;
use auth::check;

pub fn handle() {
    if true {
        check();
    }
}
`,
    );

    expect(callerCalls(root, './src/http.sh', 'handle')).toEqual(['check']);
    expect(callerCalls(root, './src/http.ps1', 'Invoke-Login')).toEqual([
      'Get-Token',
    ]);
    expect(callerCalls(root, './src/login.sql', 'handle_login')).toEqual([
      'check_header',
    ]);
    expect(callerCalls(root, './src/demo.go', 'Load')).toEqual(['Connect']);
    expect(callerCalls(root, './src/http.rs', 'handle')).toEqual(['check']);
    expect(
      blastRadius(root, 'src/auth.sh#check').dependents.map(
        (item) => item.name,
      ),
    ).toContain('handle');
    expect(
      blastRadius(root, 'src/check.sql#check_header').dependents.map(
        (item) => item.name,
      ),
    ).toContain('handle_login');
  });

  it('links Elixir, Erlang, HTML, and CSS', () => {
    const root = createTempDir();
    dirs.push(root);
    write(
      root,
      'src/auth.ex',
      `defmodule App.Auth do
  def check(header) do
    header
  end
end
`,
    );
    write(
      root,
      'src/http.ex',
      `defmodule App.Http do
  alias App.Auth
  def handle(header) do
    if header do
      Auth.check(header)
    end
  end
end
`,
    );
    write(
      root,
      'src/auth.erl',
      `-module(auth).
-export([check/1]).
check(Header) ->
    Header.
`,
    );
    write(
      root,
      'src/http.erl',
      `-module(http).
-export([handle/1]).
handle(Header) ->
    auth:check(Header).
`,
    );
    write(
      root,
      'src/app.js',
      `export function handleLogin() {
  return 1;
}
`,
    );
    write(
      root,
      'src/page.html',
      `<script src="./app.js"></script>
<button onclick="handleLogin()">Go</button>
`,
    );
    write(root, 'src/theme.css', `body { color: black; }\n`);
    write(root, 'src/main.css', `@import "./theme.css";\n`);

    expect(callerCalls(root, './src/http.ex', 'handle')).toEqual([
      'App.Auth.check',
    ]);
    expect(callerCalls(root, './src/http.erl', 'handle')).toEqual([
      'auth:check',
    ]);
    expect(callerCalls(root, './src/page.html', 'document')).toEqual([
      'handleLogin',
    ]);
    expect(
      blastRadius(root, 'src/theme.css').dependents.map((item) => item.path),
    ).toContain('./src/main.css');
    expect(
      blastRadius(root, 'src/app.js#handleLogin').dependents.map(
        (item) => item.name,
      ),
    ).toEqual(expect.arrayContaining(['document', '(imports)']));
    expect(
      blastRadius(root, 'src/auth.erl#check').dependents.map(
        (item) => item.name,
      ),
    ).toContain('http:handle');
  });
});
