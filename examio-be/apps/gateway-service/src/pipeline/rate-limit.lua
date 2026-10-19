-- KEYS[1] bucket key, ARGV[1] window in ms. Returns {count, ttl_ms}.
local c = redis.call('INCR', KEYS[1])
if c == 1 then
    redis.call('PEXPIRE', KEYS[1], ARGV[1])
end
return {c, redis.call('PTTL', KEYS[1])}
