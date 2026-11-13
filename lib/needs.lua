-- needs: terrarium plays mi-UGens (Mutable Instruments SuperCollider plugins),
-- installed and removed through norns-deps (lib/deps.lua and lib/deps/, vendored
-- from github.com/vehka/norns-deps, MIT).
--
-- Without them the script shows norns-deps' screen instead of the scene: K3
-- downloads a norns build from mi-UGens (a pinned release, checked against
-- its sha256) and runs the install.sh inside it, which moves any older mi-UGens
-- install aside (duplicate classes stop sclang compiling). terrarium needs the
-- whole set its build ships, Beads and Elements included, and that build itself (its
-- BUILDINFO, no older than the pinned one): okyeron's set, which has no Beads and
-- misses later fixes, schollz's bundle, v7b1's own or an older build of ours all get the
-- same screen, and installing replaces them. Then K3 restarts
-- norns, and terrarium comes back with them. norns-deps' manifest (in terrarium's
-- data folder) keeps what it installed, so PARAMS > remove mi-UGens takes away
-- only that: never a copy that was there before.
--
--   N.ok()               every class terrarium needs is in Extensions, from the build it installs
--   N.restart_pending()  installed (or removed), but SuperCollider hasn't restarted since
--   N.install(done)      the install (or restart) screen; done(ok) once it closes
--   N.installed()        did terrarium install them (and they're still there)?
--   N.remove(done)       the remove screen for what terrarium installed; done(ok)
--
-- norns-deps asks the system about itself as it loads (the machine, apt, sudo), so it's
-- loaded only when a screen opens: never in the browser or the plugin, which carry
-- their own mi-UGens and answer N.ok()'s find with all of them.

local N = {}

N.DIR = _path.data .. "terrarium/deps"
N.platform = nil -- a test can set a pretend norns here, so nothing asks the machine

local ID = "mi-UGens"
local VERSION = "v1.2.0"
local FILE = "mi-UGens-norns-" .. VERSION .. ".tar.gz"
local URL = "https://github.com/glassgarden/mi-UGens/releases/download/" .. VERSION .. "/" .. FILE
local SHA256 = "f997afea8a38f1f43f2a86c639c6c1a8f841591e31ce3cf698f1bf97e44864b4"
-- the pinned build's time (its BUILDINFO's "built:"): an older build of ours is replaced too
local BUILT = "2026-10-22T16:38:29Z"
local EXT = (os.getenv("HOME") or "/home/we") .. "/.local/share/SuperCollider/Extensions"
local NEEDS = { "MiPlaits", "MiRings", "MiRipples", "MiClouds", "MiVerb", "MiBeads", "MiElements" }

local function exists(path)
  local f = io.open(path, "r")
  if f then f:close() end
  return f ~= nil
end

local function q(s) return "'" .. s:gsub("'", "'\\''") .. "'" end

-- one look through Extensions for every class it needs (each a <Class>.sc file there):
-- true when all are there, plus whether any mi-UGens class is
local function classes()
  local found, any = {}, false
  for name in util.os_capture("find " .. EXT .. " -name 'Mi*.sc' 2>/dev/null", true):gmatch("([%w_]+)%.sc") do
    found[name], any = true, true
  end
  for _, class in ipairs(NEEDS) do
    if not found[class] then return false, any end
  end
  return true, any
end

-- is the set in Extensions the build terrarium installs? install.sh puts it in Extensions/mi-UGens,
-- with the BUILDINFO it was built with: Beads' PR 24 in it, and built no earlier than the pinned
-- one. No other set has one. (The browser and the plugin carry their own: nothing to look at.)
local function ours()
  if norns.version and norns.version.update == "norns-web" then return true end
  local f = io.open(EXT .. "/mi-UGens/BUILDINFO", "r")
  if not f then return false end
  local info = f:read("a")
  f:close()
  local built = info:match("\nbuilt:%s*(%S+)")
  return info:match("\nprs:[^\n]*%f[%d]24%f[%D]") ~= nil and built ~= nil and built >= BUILT
end

function N.ok() return classes() and ours() end

local function deps()
  local D = include("lib/deps")
  local d = D.new { name = "terrarium", dir = N.DIR, platform = N.platform }
  local tarball = N.DIR .. "/downloads/" .. FILE
  -- unpacked outside dust (sclang compiles every class file it finds there), and the
  -- tarball kept until the install works, so a retry doesn't download it again
  local install = table.concat({
    "d=$(mktemp -d) || exit 1",
    "trap 'rm -rf \"$d\"' EXIT",
    "tar -C \"$d\" -xzf " .. q(tarball) .. " || { echo 'bad tarball'; exit 1; }",
    "bash \"$d/install.sh\" \"$d/mi-UGens\" || exit 1",
    "rm -f " .. q(tarball),
  }, "\n")
  d:add {
    id = ID, label = "mi-UGens " .. VERSION, size = "3 MB",
    why = select(2, classes()) and "replaces the older mi-UGens there" or "the Mutable Instruments sound modules",
    check_fn = N.ok,
    restart = true, -- SuperCollider loads them as it starts
    -- a norns build (armhf): no use on a desktop or anything else
    install = { { when = { arch = "armv7l" }, steps = {
      { url = URL, sha256 = SHA256, label = "download " .. VERSION },
      { cmd = install, step_label = "install" },
    } } },
    manual = "a norns-only build; see github.com/glassgarden/mi-UGens",
    -- install.sh puts them in Extensions/mi-UGens (older installs it moved aside stay in ~/mi-UGens-backup-*)
    uninstall = { { cmd = "rm -rf \"$HOME/.local/share/SuperCollider/Extensions/mi-UGens\"",
      step_label = "remove Extensions/mi-UGens" } },
  }
  return d
end
N.deps = deps -- for the smoke test

-- norns-deps writes the install time to a marker; it's pending while SuperCollider started
-- before it. A stale marker goes, so later launches don't load norns-deps to look again.
function N.restart_pending()
  local marker = N.DIR .. "/restart_needed"
  if not exists(marker) then return false end
  if deps():restart_pending() then return true end
  os.remove(marker)
  return false
end

function N.install(done)
  deps():ensure({ ID }, { on_done = function(ok) done(ok) end })
end

-- the manifest is there only while it lists something
function N.installed() return exists(N.DIR .. "/manifest.lua") end

function N.remove(done)
  deps():remove(nil, { on_done = function(ok) done(ok) end })
end

return N
