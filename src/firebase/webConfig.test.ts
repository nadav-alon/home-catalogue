import { describe, expect, it } from 'vitest'
import {
  firebaseWebConfig,
  InvalidFirebaseWebConfigError,
  isFirebaseWebConfig,
  parseFirebaseWebConfigSnippet,
} from './webConfig.ts'

const validConfig = {
  apiKey: 'AIzaSyDOCAbC123dEf456GhI789jKl012-MnO',
  authDomain: 'household.firebaseapp.com',
  projectId: 'household',
  storageBucket: 'household.appspot.com',
  messagingSenderId: '123456789',
  appId: '1:123456789:web:abcdef',
}

describe('isFirebaseWebConfig', () => {
  it('accepts a config carrying every required field', () => {
    expect(isFirebaseWebConfig(validConfig)).toBe(true)
  })

  it.each([null, undefined, 'a string', 42, [], {}])('rejects %p', (value) => {
    expect(isFirebaseWebConfig(value)).toBe(false)
  })

  it('rejects a config missing a required field', () => {
    const { apiKey: _apiKey, ...rest } = validConfig
    expect(isFirebaseWebConfig(rest)).toBe(false)
  })

  it('rejects a config with an empty required field', () => {
    expect(isFirebaseWebConfig({ ...validConfig, projectId: '' })).toBe(false)
  })
})

describe('firebaseWebConfig', () => {
  it('returns a config that already satisfies the shape', () => {
    expect(firebaseWebConfig(validConfig)).toEqual(validConfig)
  })

  it('throws InvalidFirebaseWebConfigError naming the missing fields', () => {
    const { apiKey: _apiKey, projectId: _projectId, ...rest } = validConfig
    expect(() => firebaseWebConfig(rest)).toThrow(InvalidFirebaseWebConfigError)
    expect(() => firebaseWebConfig(rest)).toThrow(/apiKey.*projectId/)
  })
})

describe('parseFirebaseWebConfigSnippet', () => {
  it('parses a bare JSON object into a validated config', () => {
    expect(parseFirebaseWebConfigSnippet(JSON.stringify(validConfig))).toEqual(validConfig)
  })

  it('parses a JSON object wrapped in a const declaration', () => {
    const snippet = `const firebaseConfig = ${JSON.stringify(validConfig)};`
    expect(parseFirebaseWebConfigSnippet(snippet)).toEqual(validConfig)
  })

  it('parses the JavaScript snippet the Firebase console hands out, unquoted keys and all', () => {
    const snippet = `
      // Import the functions you need from the SDKs you need
      const firebaseConfig = {
        apiKey: "${validConfig.apiKey}",
        authDomain: "${validConfig.authDomain}",
        projectId: "${validConfig.projectId}",
        storageBucket: "${validConfig.storageBucket}",
        messagingSenderId: "${validConfig.messagingSenderId}",
        appId: "${validConfig.appId}"
      };
    `
    expect(parseFirebaseWebConfigSnippet(snippet)).toEqual(validConfig)
  })

  it('parses the full npm block the console hands out, import line and all', () => {
    const snippet = `
      // Import the functions you need from the SDKs you need
      import { initializeApp } from "firebase/app";
      // TODO: Add SDKs for Firebase products that you want to use
      // https://firebase.google.com/docs/web/setup#available-libraries

      // Your web app's Firebase configuration
      const firebaseConfig = {
        apiKey: "${validConfig.apiKey}",
        authDomain: "${validConfig.authDomain}",
        projectId: "${validConfig.projectId}",
        storageBucket: "${validConfig.storageBucket}",
        messagingSenderId: "${validConfig.messagingSenderId}",
        appId: "${validConfig.appId}"
      };

      const app = initializeApp(firebaseConfig);
    `
    expect(parseFirebaseWebConfigSnippet(snippet)).toEqual(validConfig)
  })

  it('parses the CDN block the console hands out, import line and all', () => {
    const snippet = `
      <script type="module">
        import { initializeApp } from "https://www.gstatic.com/firebasejs/10.0.0/firebase-app.js";
        const firebaseConfig = {
          apiKey: "${validConfig.apiKey}",
          authDomain: "${validConfig.authDomain}",
          projectId: "${validConfig.projectId}",
          storageBucket: "${validConfig.storageBucket}",
          messagingSenderId: "${validConfig.messagingSenderId}",
          appId: "${validConfig.appId}"
        };
        const app = initializeApp(firebaseConfig);
      </script>
    `
    expect(parseFirebaseWebConfigSnippet(snippet)).toEqual(validConfig)
  })

  it('rejects text with no object literal', () => {
    expect(() => parseFirebaseWebConfigSnippet('not json')).toThrow(InvalidFirebaseWebConfigError)
  })

  it('rejects an object literal that is missing required fields', () => {
    expect(() => parseFirebaseWebConfigSnippet('{"apiKey": "x"}')).toThrow(InvalidFirebaseWebConfigError)
  })
})
