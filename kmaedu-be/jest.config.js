module.exports = {
    moduleFileExtensions: ['js', 'json', 'ts'],
    rootDir: '.',
    testRegex: '.*\\.spec\\.ts$',
    transform: {
        '^.+\\.(t|j)s$': 'ts-jest',
    },
    collectCoverageFrom: ['**/*.(t|j)s'],
    coverageDirectory: './coverage',
    testEnvironment: 'node',
    roots: ['<rootDir>/apps/', '<rootDir>/libs/', '<rootDir>/test/'],
    moduleNameMapper: {
        '^@kmaedu/common(.*)$': '<rootDir>/libs/common/src/$1',
        '^@kmaedu/redis(.*)$': '<rootDir>/libs/redis/src/$1',
        '^@kmaedu/observability(.*)$': '<rootDir>/libs/observability/src/$1',
        '^@kmaedu/contracts(.*)$': '<rootDir>/libs/contracts/src/$1',
        '^@kmaedu/grpc(.*)$': '<rootDir>/libs/grpc/src/$1',
        '^@kmaedu/http(.*)$': '<rootDir>/libs/http/src/$1',
        '^@kmaedu/auth-jwt(.*)$': '<rootDir>/libs/auth-jwt/src/$1',
        '^@kmaedu/messaging(.*)$': '<rootDir>/libs/messaging/src/$1',
    },
    setupFiles: ['<rootDir>/test/jest-env.setup.js'],
    testTimeout: 30000,
};
