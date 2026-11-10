-- KEYS[1] key, ARGV[1] candidate version. Keeps the maximum; 960 s = access
-- token TTL (900) + 60 s skew. Idempotent and safe against reordered writers.
local current = tonumber(redis.call('GET', KEYS[1]))
local candidate = tonumber(ARGV[1])
if current == nil or current < candidate then
    redis.call('SET', KEYS[1], ARGV[1], 'EX', 960)
    return candidate
end
return current
