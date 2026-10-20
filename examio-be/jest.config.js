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
        '^@examio/database(.*)$': '<rootDir>/libs/database/src/$1',
        '^@examio/common(.*)$': '<rootDir>/libs/common/src/$1',
        '^@examio/redis(.*)$': '<rootDir>/libs/redis/src/$1',
        '^@examio/observability(.*)$': '<rootDir>/libs/observability/src/$1',
        '^@examio/contracts(.*)$': '<rootDir>/libs/contracts/src/$1',
        '^@examio/grpc(.*)$': '<rootDir>/libs/grpc/src/$1',
        '^@examio/http(.*)$': '<rootDir>/libs/http/src/$1',
        '^@examio/auth-jwt(.*)$': '<rootDir>/libs/auth-jwt/src/$1',
        '^@examio/messaging(.*)$': '<rootDir>/libs/messaging/src/$1',
    },
    testTimeout: 30000,
};
