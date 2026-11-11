-- Runs a script on lib/norns.lua without a browser, to check that it boots, draws and takes
-- the controls without errors: the same calls norns-web.js makes, with js_bridge stubbed.
--
--   lua test/headless.lua [script dir, default test/hello] [seconds, default 5]
--
-- Run from norns-web's folder. Exits 1 on any Lua error, or if the script never drew.

local dir = (arg[1] or "test/hello"):gsub("/$", "")
local seconds = tonumber(arg[2]) or 5
local name = dir:match("([^/]+)$")

local errors, storage = {}, {}
js_bridge = {
  log = function() end,
  error = function(e) errors[#errors + 1] = e; io.stderr:write("error: ", e, "\n") end,
  engine = function() end,
  engine_name = function() end,
  os_capture = function() return "" end,
  storage_get = function(k) return storage[k] end,
  storage_set = function(k, v) storage[k] = v end,
  midi_ports = function() return nil end,
  midi_send = function() end,
  nb = function() end,
  poll = function(name) if name == "__check" then return 0.5 end end,
  -- the page runs a system_cmd and answers later; here: at once, with the command echoed
  system_cmd = function(id, cmd) norns_web.system_cmd_done(id, "ran: " .. cmd) end,
}

dofile("lib/norns.lua")
norns_web.boot(name, name .. ".lua", dir .. "/")

local frames, fps = 0, 60
for i = 1, seconds * fps do
  local t = i / fps
  if norns_web.tick(t) then frames = frames + 1 end
  if i % fps == 0 then -- once a second: every encoder and key, as a player would
    for n = 1, 3 do norns_web.enc(n, (i // fps) % 2 == 0 and 1 or -1) end
    for n = 1, 3 do norns_web.key(n, 1); norns_web.key(n, 0) end
  end
end
assert(load("return " .. norns_web.params_json()) or true) -- params_json must not throw

-- polls: one asks the stand-in (js.poll) on its own timer and hands the value to its callback
local got, t0 = nil, seconds
local p = poll.set("__check", function(v) got = v end)
p.time = 0.1
p:start()
for i = 1, 30 do norns_web.tick(t0 + i / 60) end
assert(got == 0.5, "poll: the callback never got the stand-in's value")

-- system_cmd: the callback gets the page's output
local out
norns.system_cmd("echo hi", function(o) out = o end)
assert(out == "ran: echo hi", "system_cmd: the callback didn't get the output")

-- one at a time, as on norns: a command waits for the one before it to finish
local held, order = {}, {}
local answer = js_bridge.system_cmd
js_bridge.system_cmd = function(id, cmd) held[#held + 1] = { id = id, cmd = cmd } end
norns.system_cmd("first", function(o) order[#order + 1] = o end)
norns.system_cmd("second", function(o) order[#order + 1] = o end)
assert(#held == 1, "system_cmd: the second ran before the first finished")
norns_web.system_cmd_done(held[1].id, "1")
assert(#held == 2 and held[2].cmd == "second", "system_cmd: the second didn't run after the first")
norns_web.system_cmd_done(held[2].id, "2")
assert(order[1] == "1" and order[2] == "2", "system_cmd: callbacks out of order")
js_bridge.system_cmd = answer

print(string.format("%s: %d frames in %d s, %d error(s)", name, frames, seconds, #errors))
if #errors > 0 or frames == 0 then os.exit(1) end
