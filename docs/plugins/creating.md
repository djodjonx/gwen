# Creating Plugins

Extend GWEN with custom plugins.

## Plugin Structure

```typescript
import { createPlugin } from '@gwen/engine-core';

export const MyPlugin = createPlugin({
  name: 'MyPlugin',

  onInit(api) {
    // Setup
    api.services.register('myService', {
      doSomething: () => console.log('Hello!')
    });
  },

  onUpdate(api, dt) {
    // Run every frame
  },

  onDestroy(api) {
    // Cleanup
  }
});
```

## Registering Services

```typescript
onInit(api) {
  api.services.register('myService', {
    value: 42,
    method: () => 'result'
  });
}
```

Access from systems:

```typescript
const service = api.services.get('myService');
console.log(service.value); // 42
```

## Type Safety

Define service types:

```typescript
export interface MyService {
  value: number;
  method(): string;
}

export interface GwenServices {
  myService: MyService;
}
```

## Next Steps

- [Official Plugins](/plugins/official) - See examples
- [Systems](/core/systems) - Use plugins

