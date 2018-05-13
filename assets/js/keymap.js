// encapsulate the keymap
function Keymap() {
  var instance = this;
  instance.km = [];
  instance.l = 0;
  instance.dirty = false;

  _.extend(this, {
    assignKey: assignKey,
    changeLayer: _changeLayer,
    clear: clear,
    clearDirty: clearDirty,
    exportLayers: exportLayers,
    getKey: getKey,
    initLayer: initLayer,
    isDirty: isDirty,
    setContents: setContents,
    setDirty: setDirty,
    setKey: setKey,
    setKeycodeLayer: setKeycodeLayer,
    setText: setText,
    size: size,
    swapKeys: swapKeys
  });
  return instance;

  //////////
  // Impl
  //////////

  function assignKey(__layer, index, name, code, type) {
    instance.km[__layer][index] = {
      name: name,
      code: code,
      type: type
    };
    var keycode = instance.km[__layer][index];
    if (keycode.type === 'layer') {
      instance.km[__layer][index].layer = 0;
    }
    return keycode;
  }

  function setContents(index, key) {
    instance.km[instance.l][index].contents = key;
  }

  function _changeLayer(newLayer) {
    instance.l = newLayer;
  }

  function clear() {
    instance.km = [];
  }

  function initLayer(__layer) {
    instance.km[__layer] = {};
  }

  function setKey(__layer, index, key) {
    instance.km[__layer][index] = key;
    return instance.km[__layer][index];
  }

  function size(__layer) {
    return _.size(instance.km[__layer]);
  }

  function getKey(__layer, index) {
    if (instance.km[__layer] === undefined) {
      instance.km[__layer] = {};
    }
    return instance.km[__layer][index];
  }

  function swapKeys(__layer, srcIndex, dstIndex) {
    var temp = instance.km[__layer][srcIndex];
    instance.km[__layer][srcIndex] = instance.km[__layer][dstIndex];
    instance.km[__layer][dstIndex] = temp;
    instance.dirty = true;
  }

  function setText(__layer, index, text) {
    instance.km[__layer][index].text = text;
  }

  function exportLayers({ compiler }) {
    return _.reduce(
      instance.km,
      function(layers, _layer, k) {
        layers[k] = [];
        var aLayer = _.reduce(
          _layer,
          function(acc, key) {
            var keycode = key.code;
            if (key.code.indexOf('(kc)') !== -1) {
              if (key.contents) {
                keycode = keycode.replace('kc', key.contents.code);
              } else {
                keycode = keycode.replace('kc', 'KC_NO');
              }
            }
            if (key.code.indexOf('(layer)') !== -1) {
              keycode = keycode.replace('layer', key.layer);
            }
            if (key.code.indexOf('text') !== -1) {
              // add a special ANY marker to keycodes that were defined using ANY
              // This will be stripped back off on import.
              keycode = compiler ? key.text : `ANY(${key.text})`;
            }
            acc.push(keycode);
            return acc;
          },
          []
        );
        layers[k] = aLayer;
        return layers;
      },
      []
    );
  }

  function setKeycodeLayer(_layer, index, toLayer) {
    instance.km[_layer][index].layer = toLayer;
    if (toLayer !== _layer) {
      if (instance.km[toLayer] === undefined) {
        instance.km[toLayer] = {};
      }
      instance.km[toLayer][index] = { name: '▽', code: 'KC_TRNS' };
    }
  }

  function isDirty() {
    return instance.dirty;
  }

  function clearDirty() {
    instance.dirty = false;
  }

  function setDirty() {
    instance.dirty = true;
  }
}

export default Keymap;
