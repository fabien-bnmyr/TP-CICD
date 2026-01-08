/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: '.',
  testMatch: ['<rootDir>/tests/**/*.test.ts'],
  moduleNameMapper: {
    '^src/(.*)$': '<rootDir>/src/$1',
  },
  modulePathIgnorePatterns: ['<rootDir>/figma-plugin'],
  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        isolatedModules: true,
        // C'EST ICI QUE LA MAGIE OPÈRE :
        tsconfig: {
          esModuleInterop: true, // Permet à "import express" de fonctionner
          allowSyntheticDefaultImports: true
        }
      },
    ],
  },
};