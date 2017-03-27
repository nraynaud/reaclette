export const graftParentState = (state, parentState) => {
  if (parentState) {
    Object.keys(parentState).forEach(parentKey => {
      if (parentKey in state) { return; }
      Object.defineProperty(state, parentKey, {
        get: function () { return parentState[parentKey]; }
      });
    });
  }
  return state;
};

export class HocState {
  constructor (
    initialState,
    computed,
    onChange,
    middleware = []
  ) {
    this.state = initialState;

    this.cachedState = Object.create(null);
    this.computedDependants = Object.create(null);

    this.computed = computed;
    this.onChange = onChange
    this.middleware = middleware;

    this.getTrackedState = this.getTrackedState.bind(this);
  }

  getTrackedState (computedKey, stateObj, accessibleKeys) {
    const { computedDependants } = this;
    const stateProxy = Object.create(null);

    accessibleKeys.forEach(stateKey => {
      Object.defineProperty(stateProxy, stateKey, {
        get: function () {
          computedDependants[stateKey] = computedDependants[stateKey] || Object.create(null);
          computedDependants[stateKey][computedKey] = true;
          return stateObj[stateKey];
        }
      });
    });

    return stateProxy;
  }
  
  defineComputedStateProperties (state) {
    const { cachedState, getTrackedState, computed } = this;
    
    const computedKeys = Object.keys(computed);
    const accessibleKeys = [].concat(computedKeys, Object.keys(state));

    computedKeys.forEach(computedKey => {
      const trackedState = getTrackedState(computedKey, state, accessibleKeys);

      Object.defineProperty(state, computedKey, {
        enumerable: true,
        get: function () {
          if (computedKey in cachedState) { return cachedState[computedKey]; }
          return cachedState[computedKey] = computed[computedKey](trackedState);
        }
      });
    });
  }
  
  getState () {
    let state = Object.create(null);
    Object.assign(state, this.state);
    this.defineComputedStateProperties(state);
    
    state = this.middleware.reduce(
      (memo, middleware) => middleware.transformState(memo),
      state
    );

    return state;
  }

  invalidateCache (key) {
    const { computedDependants } = this;
    const valuesDependingOnKey = Object.keys(this.computedDependants[key] || {});

    valuesDependingOnKey.forEach(dependantKey => {
      delete this.cachedState[dependantKey];
      this.invalidateCache(dependantKey);
    });
  }

  set (key, newVal) {
    const oldVal = this.state[key];

    if (oldVal === newVal) { return; }

    this.invalidateCache(key);
    this.state[key] = newVal;
  }

  setState (newState) {
    const oldState = this.state;
    const allKeys = Object.keys(Object.assign({}, oldState, newState));
    allKeys.forEach(key => this.set(key, newState[key]));
    return new Promise(resolve => this.onChange(resolve));
  }
}
