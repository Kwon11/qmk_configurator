import Keymap from './keymap';
import checkStatus from './status';
import getKeycodes from './keycodes';

$(document).ready(() => {
  var layouts = {};
  //  var keymap = [];
  var layer = 0;
  var job_id = '';
  var hex_stream = '';
  var hex_filename = '';
  var keyboards = [];
  var status = '';
  var keyboard = '';
  var layout = '';
  var backend_baseurl = 'https://api.qmk.fm';
  var backend_keyboards_url = `${backend_baseurl}/v1/keyboards`;
  var backend_compile_url = `${backend_baseurl}/v1/compile`;
  var backend_status_url = `${backend_baseurl}/v1`;
  var backend_readme_url_template = _.template(
    `${backend_keyboards_url}/<%= keyboard %>/readme`
  );
  var defaults = {
    MAX_X: 775,
    KEY_WIDTH: 40,
    KEY_HEIGHT: 40,
    SWAP_KEY_WIDTH: 30,
    SWAP_KEY_HEIGHT: 30,
    KEY_X_SPACING: 45,
    KEY_Y_SPACING: 45,
    SCALE: 1
  };

  var config = {};

  var myKeymap = new Keymap(layer);

  var $keyboard = $('#keyboard');
  var $layout = $('#layout');
  var $layer = $('.layer');
  var $compile = $('#compile');
  var $hex = $('#hex');
  var $source = $('#source');
  var $export = $('#export');
  var $import = $('#import');
  var $loadDefault = $('#load-default');
  var $fileImport = $('#fileImport');
  var $status = $('#status');
  var $visualKeymap = $('#visual-keymap');

  setSelectWidth($keyboard);
  setSelectWidth($layout);

  var lookupKeycode = _.memoize(lookupKeycode); // cache lookups
  var viewReadme = _.debounce(viewReadme, 500);

  var keycodes = getKeycodes();
  $(window).on('hashchange', urlRouteChanged);

  $.each(keycodes, createKeyCodeUI);

  var $keycodes = $('.keycode'); // wait until they are created
  $keycodes.each(makeDraggable);

  // click to assign keys to keymap
  $visualKeymap.click(selectKeymapKey);
  $('#keycodes').click(assignKeycodeToSelectedKey);

  var promise = $.get(backend_keyboards_url, createKeyboardDropdown);

  $keyboard.change(
    checkIsDirty(switchKeyboardLayout, () =>
      $keyboard.val(keyboard_from_hash())
    )
  );

  $layout.change(
    checkIsDirty(changeLayout, () => $layout.val(layout_from_hash()))
  );

  $layer.click(changeLayer);

  $compile.click(compileLayout);

  $hex.click(downloadHexFile);

  $source.click(downloadSourceBundle);

  var offsetTop = $('.split-content').offset().top;
  var height = $('.split-content').height();

  $(document).on('scroll', scrollHandler);

  // Export function that outputs a JSON file with the API payload format
  $export.click(exportJSON);

  //Uses a button to activate the hidden file input
  $import.click(
    checkIsDirty(() => {
      $fileImport.click();
    })
  );

  $loadDefault.click(checkIsDirty(loadDefault));

  //Import function that takes in a JSON file reads it and loads the keyboard, layout and keymap data
  $fileImport.change(importJSON);

  // explicitly export functions to global namespace
  window.setSelectWidth = setSelectWidth;

  promise.then(() => {
    // wait until keyboard list has loaded before checking url hash
    urlRouteChanged();
  });

  var keypressListener = new window.keypress.Listener();
  keypressListener.register_many(generateKeypressCombos(keycodes));

  var ignoreKeypressListener = _.partial(
    ignoreKeypressListener,
    keypressListener
  );

  ignoreKeypressListener($('input[type=text]'));

  checkStatus(backend_status_url);
  return;

  ////////////////////////////////////////
  //
  // Implementation goes here
  //
  ////////////////////////////////////////

  function ignoreKeypressListener(listener, $element) {
    $element
      .focus(() => listener.stop_listening())
      .blur(() => listener.listen());
  }

  // generate keypress combo list from the keycodes list
  function generateKeypressCombos(_keycodes) {
    return _keycodes
      .filter(({ keys }) => {
        // only keycodes with keys members
        return !_.isUndefined(keys);
      })
      .map(keycode => generateKeypressHandler(keycode));
  }

  // generate a keypress combo handler per keycode
  function generateKeypressHandler(keycode) {
    return {
      keys: keycode.keys,
      on_keydown: () => {
        var meta = lookupKeyPressCode(keycode.keys);
        if (meta === undefined) {
          return;
        }

        var $key = getSelectedKey();
        var _index = $key.data('index');
        if ($key === undefined || _index === undefined || !_.isNumber(_index)) {
          return; // not a key
        }

        if ($key.hasClass('key-contents')) {
          myKeymap.setContents(_index, newKey(meta, keycode.data('code')));
        } else {
          myKeymap.assignKey(layer, _index, meta.name, keycode.code, meta.type);
        }
        $key.removeClass('keycode-select'); // clear selection once assigned
        render_key(layer, _index);
        myKeymap.setDirty();
      }
    };
  }

  function viewReadme() {
    $.get(backend_readme_url_template({ keyboard: keyboard })).then(result => {
      $status.append(_.escape(result));
    });
  }

  function resetConfig(overrides) {
    return _.extend(config, defaults, overrides);
  }

  function assignKeycodeToSelectedKey(evt) {
    var _keycode = $(evt.target).data('code');
    if (_keycode === undefined) {
      return;
    }

    var meta = lookupKeycode(_keycode);
    if (meta === undefined) {
      return;
    }

    var $key = getSelectedKey();
    var _index = $key.data('index');
    if ($key === undefined || _index === undefined || !_.isNumber(_index)) {
      return; // not a key
    }

    if ($key.hasClass('key-contents')) {
      myKeymap.setContents(_index, newKey(meta, _keycode.data('code')));
    } else {
      myKeymap.assignKey(layer, _index, meta.name, _keycode, meta.type);
    }
    $key.removeClass('keycode-select'); // clear selection once assigned
    render_key(layer, _index);
    myKeymap.setDirty();
  }

  function getSelectedKey() {
    return $visualKeymap.find('.key.keycode-select');
  }

  function selectKeymapKey(evt) {
    var $target = $(evt.target);
    getSelectedKey().removeClass('keycode-select');
    if ($target.hasClass('key')) {
      $target.addClass('keycode-select');
    }
  }

  function checkIsDirty(confirmFn, cancelFn) {
    return () => {
      if (myKeymap.isDirty()) {
        if (
          !confirm(
            'This will clear your keymap - are you sure you want to change your layout?'
          )
        ) {
          if (_.isFunction(cancelFn)) {
            cancelFn();
          }
          return;
        }
      }
      confirmFn();
    };
  }

  function loadDefault() {
    // hard-coding planck as the only default right now
    var keyboardName = $keyboard.val().replace('/', '_');
    $.get(`keymaps/${keyboardName}_default.json`, data => {
      console.log(data);
      reset_keymap();

      keyboard = data.keyboard;
      $keyboard.val(keyboard);
      setSelectWidth($keyboard);
      load_layouts($keyboard.val()).then(() => {
        layout = data.layout;
        $layout.val(layout);
        setSelectWidth($layout);

        setKeymapName(data.keymap);

        load_converted_keymap(data.layers);

        render_layout($layout.val());
        myKeymap.setDirty();
      });
    }).fail(error => {
      statusError(
        `\n* Sorry there is no default for the ${$keyboard.val()} keyboard... yet!`
      );
      console.log('error loadDefault', error);
    });
  }

  function getKeymapName() {
    return $('#keymap-name')
      .val()
      .replace(/\s/g, '_');
  }

  function setKeymapName(name) {
    $('#keymap-name').val(name.replace(/\s/g, '_'));
  }

  function importJSON() {
    var files = $fileImport[0].files;

    var reader = new FileReader();

    reader.onload = function layoutLoaded(/*e*/) {
      var jsonText = reader.result;

      var data;
      try {
        data = JSON.parse(jsonText);
      } catch (error) {
        console.log(error);
        alert("Sorry, that doesn't appear to be a valid QMK keymap file.");
      }

      if (data.version && data.keyboard && data.keyboard.settings) {
        alert(
          "Sorry, QMK Configurator doesn't support importing kbfirmware JSON files."
        );
        return;
      }

      if (
        _.isUndefined(data.keyboard) ||
        _.isUndefined(data.keymap) ||
        _.isUndefined(data.layout) ||
        _.isUndefined(data.layers)
      ) {
        alert("Sorry, this doesn't appear to be a QMK keymap file.");
        return;
      }

      reset_keymap();

      keyboard = data.keyboard;
      $keyboard.val(keyboard);
      setSelectWidth($keyboard);
      load_layouts($keyboard.val()).then(() => {
        setSelectWidth($('#layout'));
        layout = data.layout;
        $layout.val(layout);
        switchKeyboardLayout();

        setKeymapName(data.keymap);

        load_converted_keymap(data.layers);

        render_layout($layout.val());
        myKeymap.setDirty();
        viewReadme();
      });
    };

    reader.readAsText(files[0]);
  }

  function exportJSON() {
    //Squashes the keymaps to the api payload format, might look into making this a function
    var layers = myKeymap.exportLayers({ compiler: false });

    //API payload format
    var data = {
      keyboard: $keyboard.val(),
      keymap: getKeymapName(),
      layout: $layout.val(),
      layers: layers
    };

    download(getKeymapName() + '.json', JSON.stringify(data));
  }
  function scrollHandler() {
    if (offsetTop < $(document).scrollTop()) {
      $('.split-content').addClass('fixed');
      $('#keycodes-section').css('margin-top', height + 'px');
    } else {
      $('#keycodes-section').css('margin-top', '0px');
      $('.split-content').removeClass('fixed');
    }
  }

  function downloadSourceBundle() {
    $.get(backend_compile_url + '/' + job_id + '/source', function(data) {
      console.log(data);
    });
  }
  function downloadHexFile() {
    // $.get(backend_compile_url + "/" + job_id + "/hex", function(data) {
    //   console.log(data);
    // });
    download(hex_filename, hex_stream);
  }

  function compileLayout() {
    disableCompileButton();
    var layers = myKeymap.exportLayers({ compiler: true });
    var data = {
      keyboard: $keyboard.val(),
      keymap: getKeymapName(),
      layout: $layout.val(),
      layers: layers
    };
    console.log(JSON.stringify(data));
    if ($status.html() !== '') {
      $status.append('\n');
    }
    $status.append(
      '* Sending ' +
        $keyboard.val() +
        ':' +
        getKeymapName() +
        ' with ' +
        $layout.val()
    );
    $.ajax({
      type: 'POST',
      url: backend_compile_url,
      contentType: 'application/json',
      data: JSON.stringify(data),
      dataType: 'json',
      success: function(d) {
        if (d.enqueued) {
          $status.append('\n* Received job_id: ' + d.job_id);
          job_id = d.job_id;
          check_status();
        }
      }
    });
  }

  function changeLayer(e) {
    $('.layer.active').removeClass('active');
    $(e.target).addClass('active');
    layer = e.target.innerHTML;
    myKeymap.changeLayer(layer);
    render_layout($('#layout').val());
  }

  function changeLayout() {
    window.location.hash = '#/' + $keyboard.val() + '/' + $layout.val();
    myKeymap.clearDirty();
  }

  function switchKeyboardLayout() {
    window.location.hash = '#/' + $keyboard.val() + '/' + $layout.val();
    $status.html(''); // clear the DOM not the value otherwise weird things happen
    myKeymap.clearDirty();
    disableOtherButtons();
    // load_layouts($keyboard).val());
  }

  function createKeyboardDropdown(data) {
    keyboards = data;
    $.each(data, function(k, d) {
      $keyboard.append(
        $('<option>', {
          value: d,
          text: d
        })
      );
    });
    if (keyboard_from_hash()) {
      $keyboard.val(keyboard_from_hash());
    }
    setSelectWidth($keyboard);
    load_layouts($keyboard.val());
  }

  function makeDraggable(k, d) {
    $(d).draggable({
      zIndex: 100,
      revert: true,
      revertDuration: 100,
      distance: 5,
      drag: function() {
        var $d = $(d);
        if ($d.hasClass('key')) {
          // reduce size of dragged key to indicate src
          var w = $d.data('w');
          var h = $d.data('h');
          $d.css({
            width: `${config.SWAP_KEY_WIDTH * w}px`,
            height: `${config.SWAP_KEY_HEIGHT * h}px`
          });
        }
        $d.draggable('option', 'revertDuration', 100);
      },
      start: function(event, ui) {
        // center the key under the cursor - stackoverflow
        $(this).draggable('instance').offset.click = {
          left: Math.floor(ui.helper.width() / 2),
          top: Math.floor(ui.helper.height() / 2)
        };
      },
      stop: function() {
        var $d = $(d);
        $d.css({
          'z-index': ''
        });
        if ($d.hasClass('key')) {
          var w = $d.data('w');
          var h = $d.data('h');
          var dims = calcKeyKeymapDims(w, h);
          $d.css({
            width: `${dims.w}px`,
            height: `${dims.h}px`
          });
        }
      }
    });
  }

  function createKeyCodeUI(k, d) {
    if (d.code) {
      var keycode = $('<div>', {
        class: 'keycode keycode-' + d.width + ' keycode-' + d.type,
        'data-code': d.code,
        'data-type': d.type,
        html: d.name,
        title: d.title
      });
      $('#keycodes').append(keycode);
    } else {
      $('#keycodes').append(
        $('<div>', {
          class: 'space space-' + d.width,
          html: d.label
        })
      );
    }
  }

  function urlRouteChanged() {
    console.log(window.location.hash);

    if (keyboard_from_hash() && keyboard_from_hash() !== keyboard) {
      reset_keymap();
      keyboard = keyboard_from_hash();
      $keyboard.val(keyboard);
      setSelectWidth($keyboard);
      load_layouts($keyboard.val());
    } else if (layout_from_hash() && layout_from_hash() !== layout) {
      reset_keymap();
      layout = layout_from_hash();
      $layout.val(layout);
      setSelectWidth($layout);
      render_layout($layout.val());
    }
    viewReadme();
  }

  function load_layouts(_keyboard) {
    return $.get(backend_keyboards_url + '/' + _keyboard, function(data) {
      if (data.keyboards[_keyboard]) {
        $layout.find('option').remove();
        layouts = {};
        $.each(data.keyboards[_keyboard].layouts, function(k, d) {
          $layout.append(
            $('<option>', {
              value: k,
              text: k
            })
          );
          if (d.layout) {
            layouts[k] = d.layout;
          } else {
            layouts[k] = d;
          }
        });

        if (layout_from_hash()) {
          $layout.val(layout_from_hash());
        }
        changeLayout();
        setSelectWidth($('#layout'));
        render_layout($('#layout').val());
      }
    });
  }

  function calcKeyKeymapDims(w, h) {
    return {
      w: w * config.KEY_X_SPACING - (config.KEY_X_SPACING - config.KEY_WIDTH),
      h: h * config.KEY_Y_SPACING - (config.KEY_Y_SPACING - config.KEY_HEIGHT)
    };
  }

  function calcKeyKeymapPos(x, y) {
    return {
      x: x * config.KEY_X_SPACING,
      y: y * config.KEY_Y_SPACING
    };
  }

  function render_layout(_layout) {
    $visualKeymap.find('*').remove();

    var max = { x: 0, y: 0 };

    $.each(layouts[_layout], function(k, d) {
      // pre-calc size
      if (!d.w) {
        d.w = 1;
      }
      if (!d.h) {
        d.h = 1;
      }
      var pos = calcKeyKeymapPos(d.x, d.y);
      var dims = calcKeyKeymapDims(d.w, d.h);
      max.x = Math.max(max.x, pos.x + dims.w);
      max.y = Math.max(max.y, pos.y + dims.h);
    });

    if (max.x > defaults.MAX_X) {
      config.SCALE = defaults.MAX_X / max.x;
      config.KEY_WIDTH *= config.SCALE;
      config.KEY_HEIGHT *= config.SCALE;
      config.SWAP_KEY_HEIGHT *= config.SCALE;
      config.SWAP_KEY_WIDTH *= config.SCALE;
      config.KEY_X_SPACING *= config.SCALE;
      config.KEY_Y_SPACING *= config.SCALE;
      max.x *= config.SCALE;
      max.y *= config.SCALE;
    }

    $.each(layouts[_layout], function(k, d) {
      if (!d.w) {
        d.w = 1;
      }
      if (!d.h) {
        d.h = 1;
      }
      var pos = calcKeyKeymapPos(d.x, d.y);
      var dims = calcKeyKeymapDims(d.w, d.h);
      var key = $('<div>', {
        class: 'key disabled',
        style: [
          'left: ',
          pos.x,
          'px; top: ',
          pos.y,
          'px; width: ',
          dims.w,
          'px; height: ',
          dims.h,
          'px'
        ].join(''),
        id: 'key-' + k,
        'data-index': k,
        'data-type': 'key',
        'data-w': d.w,
        'data-h': d.h
      });
      $(key).droppable(droppable_config(key, k));
      $visualKeymap.append(key);
      render_key(layer, k);
    });
    $visualKeymap.css({
      width: max.x + 'px',
      height: max.y + 'px'
    });

    $('.key').each(makeDraggable);
  }

  function statusError(message) {
    $status.append(message);
    $status.scrollTop($status[0].scrollHeight);
  }

  function enableCompileButton() {
    $compile.removeAttr('disabled');
  }

  function disableCompileButton() {
    $compile.attr('disabled', 'disabled');
  }

  function enableOtherButtons() {
    [$hex, $('#toolbox'), $source].forEach($el => {
      $el.removeAttr('disabled');
    });
  }

  function disableOtherButtons() {
    [$hex, $('#toolbox'), $source].forEach($el => {
      $el.attr('disabled', 'disabled');
    });
  }

  function check_status() {
    $.get(backend_compile_url + '/' + job_id, function(data) {
      console.log(data);
      let msg;
      switch (data.status) {
        case 'finished':
          $status.append(
            '\n* Finished:\n' + data.result.output.replace(/\[.*m/gi, '')
          );
          hex_stream = data.result.firmware;
          hex_filename = data.result.firmware_filename;
          enableCompileButton();
          enableOtherButtons();
          break;
        case 'queued':
          msg = status === 'queued' ? ' .' : '\n* Queueing';
          $status.append(msg);
          setTimeout(check_status, 500);
          break;
        case 'running':
          msg = status === 'running' ? ' .' : '\n* Running';
          $status.append(msg);
          setTimeout(check_status, 500);
          break;
        case 'unknown':
          enableCompileButton();
          break;
        case 'failed':
          statusError('\n* Failed');
          if (data.result) {
            statusError('\n* Error:\n' + data.result.output);
          }
          enableCompileButton();
          break;
        default:
          console.log('Unexpected status', data.status);
          enableCompileButton();
      }
      $status.scrollTop($status[0].scrollHeight);
      status = data.status;
    });
  }

  function download(filename, text) {
    var element = document.createElement('a');
    element.setAttribute(
      'href',
      'data:text/plain;charset=utf-8,' + encodeURIComponent(text)
    );
    element.setAttribute('download', filename);

    element.style.display = 'none';
    document.body.appendChild(element);

    element.click();

    document.body.removeChild(element);
  }

  function lookupKeyPressCode(searchTerm) {
    return lookupKeycode(searchTerm, true);
  }

  function lookupKeycode(searchTerm, isKeys) {
    var found = keycodes.find(({ code, keys }) => {
      return code === searchTerm || (isKeys && keys && keys === searchTerm);
    });
    return found;
  }

  function newAnyKey(keycode) {
    var anyKey = lookupKeycode('text');
    // make a copy otherwise it uses a reference
    return $.extend({}, anyKey, { text: keycode });
  }

  function newKey(metadata, keycode, obj) {
    var key = {
      name: metadata.name,
      code: keycode,
      type: metadata.type
    };

    if (obj !== undefined) {
      key = $.extend(key, obj);
    }

    return key;
  }

  function stripANY(keycode) {
    if (keycode.indexOf('ANY(') === 0) {
      // strip ANY from keycodes, this is only for human debugging
      keycode = keycode.slice(4, -1);
    }
    return keycode;
  }

  function parseKeycode(keycode, stats) {
    var metadata;

    keycode = stripANY(keycode);

    // Check if the keycode is a complex/combo keycode ie. contains ()
    if (keycode.includes('(')) {
      // Pull the keycode and or layer from within the brackets
      var key, outerKeycode;
      var splitcode = keycode.split('(');
      var maincode = splitcode[0];
      var internal = splitcode[1];
      internal = internal.split(')')[0];

      //Check whether it is a layer switching code or combo keycode
      if (internal.includes('KC')) {
        // combo keycode
        metadata = lookupKeycode(internal);
        if (metadata === undefined) {
          return newAnyKey(keycode);
        }
        var internalkeycode = newKey(metadata, internal);

        outerKeycode = maincode + '(kc)';
        metadata = lookupKeycode(outerKeycode);
        if (metadata === undefined) {
          return newAnyKey(keycode);
        }

        key = newKey(metadata, keycode, { contents: internalkeycode });
        return key;
      }

      // layer switching
      outerKeycode = maincode + '(layer)';
      metadata = lookupKeycode(outerKeycode);
      if (metadata === undefined) {
        return newAnyKey(keycode);
      }
      var key = newKey(metadata, keycode, { layer: internal });
      return key;
    }

    if (keycode.length < 4) {
      // unexpectedly short keycode
      $status.append(
        `Found an unexpected keycode \'${_.escape(keycode)}\' on layer ${
          stats.layers
        } in keymap. Setting to KC_NO\n`
      );
      return lookupKeycode('KC_NO');
    }

    // regular keycode
    metadata = lookupKeycode(keycode);
    if (metadata === undefined) {
      return newAnyKey(keycode);
    }
    return newKey(metadata, keycode);
  }

  //Function that takes in a keymap loops over it and fills populates the keymap variable
  function load_converted_keymap(converted_keymap) {
    //Empty the keymap variable
    //keymap = [];
    myKeymap.clear();

    //Loop over each layer from the keymap
    var stats = { count: 0, any: 0, layers: 0 };
    $.each(converted_keymap, function(_layer /*, keys*/) {
      //Add layer object for every layer that exists
      myKeymap.initLayer(_layer);
      //Loop over each keycode in the layer
      $.each(converted_keymap[_layer], function(key, keycode) {
        var key = myKeymap.setKey(_layer, key, parseKeycode(keycode, stats));
        stats.count += 1;

        if (key.name === 'Any') {
          stats.any += 1;
        }
      });
      if (myKeymap.size(_layer) > 0) {
        $(`.layer.${_layer}`).addClass('non-empty');
      }
      stats.layers += 1;
    });

    var msg = `\nLoaded ${stats.layers} layers and ${
      stats.count
    } keycodes. Defined ${stats.any} Any key keycodes\n`;
    $status.append(msg);
  }

  function setSelectWidth(s) {
    var sel = $(s);
    $('#templateOption').text(sel.val());
    sel.width($('#template').width() * 1.03);
  }

  function reset_keymap() {
    config = resetConfig();
    myKeymap.clear();
    layer = 0;
    $('.layer').removeClass('non-empty active');
    $('.layer.0').addClass('active');
  }

  function keyboard_from_hash() {
    if (keyboards.indexOf(window.location.hash.replace(/\#\//gi, '')) !== -1) {
      return window.location.hash.replace(/\#\//gi, '');
    } else if (
      keyboards.indexOf(
        window.location.hash.replace(/\#\//gi, '').replace(/\/[^\/]+$/gi, '')
      ) !== -1
    ) {
      return window.location.hash
        .replace(/\#\//gi, '')
        .replace(/\/[^\/]+$/gi, '');
    } else {
      return false;
    }
  }

  function layout_from_hash() {
    if (window.location.hash.replace(/^.+\//i, '') in layouts) {
      return window.location.hash.replace(/^.+\//i, '');
    } else {
      return false;
    }
  }

  function droppable_config(t, key) {
    return {
      over: function(/* event, ui*/) {
        $(t).addClass('active-key');
        if ($(t).hasClass('key-contents')) {
          $(t)
            .parent()
            .removeClass('active-key');
        }
      },
      out: function(/* event, ui */) {
        $(t).removeClass('active-key');
        if ($(t).hasClass('key-contents')) {
          $(t)
            .parent()
            .addClass('active-key');
        }
      },
      drop: function(event, ui) {
        var $target;
        if ($(t).hasClass('active-key')) {
          $target = $(t);
        } else {
          // this is probably a container
          $target = $(t).find('.active-key');
          if ($target.length === 0) {
            // if we can't find a container
            return;
          }
          $target = $($target[0]);
        }
        var srcKeycode = ui.helper[0];
        $(srcKeycode).draggable('option', 'revertDuration', 0);
        $target.removeClass('active-key');
        $('.layer.active').addClass('non-empty');
        if ($(srcKeycode).hasClass('keycode')) {
          $(t).attr('data-code', srcKeycode.dataset.code);
          // $(t).draggable({revert: true, revertDuration: 100});
          if ($target.hasClass('key-contents')) {
            if (srcKeycode.dataset.type !== 'container') {
              // we currently don't support nested containers
              myKeymap.setContents(key, {
                name: srcKeycode.innerHTML,
                code: srcKeycode.dataset.code,
                type: srcKeycode.dataset.type
              });
            }
          } else {
            myKeymap.assignKey(
              layer,
              key,
              srcKeycode.innerHTML,
              srcKeycode.dataset.code,
              srcKeycode.dataset.type
            );
          }
        } else {
          // handle swapping keys in keymap
          var $src = $(srcKeycode);
          var $dst = $(t);
          var srcIndex = $src.data('index');
          var dstIndex = $dst.data('index');

          // get src and dest positions for animation
          var srcPrevPos = ui.draggable.data().uiDraggable.originalPosition;
          var srcPos = {
            left: `${srcPrevPos.left}px`,
            top: `${srcPrevPos.top}px`
          };
          var dstPos = $dst.css(['left', 'top']);

          // use promises to wait until animation finished
          var deferSrc = $.Deferred();
          var deferDst = $.Deferred();

          // animate swapping
          $src.animate(
            { left: dstPos.left, top: dstPos.top },
            150,
            'linear',
            () => {
              deferSrc.resolve();
            }
          );
          $dst.animate(
            { left: srcPos.left, top: srcPos.top },
            150,
            'linear',
            () => {
              deferDst.resolve();
            }
          );

          function animationsFinished() {
            // restore original element positions just swap their data
            $src.css({ left: srcPos.left, top: srcPos.top });
            $dst.css({ left: dstPos.left, top: dstPos.top });

            myKeymap.swapKeys(layer, srcIndex, dstIndex);

            render_key(layer, srcIndex);
            render_key(layer, key);
          }

          // wait until both animations are complete
          $.when(deferSrc, deferDst).done(animationsFinished);
          return;
        }
        myKeymap.setDirty();
        render_key(layer, key);
      }
    };
  }

  function render_key(_layer, k) {
    var key = $('#key-' + k);
    var keycode = myKeymap.getKey(_layer, k);
    if (!keycode) {
      keycode = myKeymap.assignKey(_layer, k, '', 'KC_NO', '');
    }
    $(key).html(keycode.name);
    if (keycode.type === 'container') {
      $(key).addClass('key-container');
      var container = $('<div>', {
        class: 'key-contents'
      });
      if (keycode.contents) {
        $(container).html(keycode.contents.name);
      }
      $(container).droppable(droppable_config(container, k));
      $(key).append(container);
    } else if (keycode.type === 'layer') {
      $(key).addClass('key-layer');
      var layer_input1 = $('<input>', {
        class: 'key-layer-input',
        type: 'number',
        val: keycode.layer
      }).on('input', function() {
        var val = $(this).val();
        myKeymap.setKeycodeLayer(_layer, k, val);
      });
      ignoreKeypressListener(layer_input1);
      $(key).append(layer_input1);
    } else if (keycode.type === 'text') {
      $(key).addClass('key-layer');
      var layer_input = $('<input>', {
        class: 'key-layer-input',
        val: keycode.text
      }).on('input', function(/*e*/) {
        myKeymap.setText(layer, k, $(this).val());
      });
      ignoreKeypressListener(layer_input);
      $(key).append(layer_input);
    } else {
      $(key).removeClass('key-container');
      $(key).removeClass('key-layer');
    }
    if (keycode.code !== 'KC_NO') {
      var remove_keycode = $('<div>', {
        class: 'remove',
        html: '&#739;',
        click: function(evt) {
          evt.preventDefault();
          evt.stopPropagation();
          myKeymap.assignKey(layer, k, '', 'KC_NO', '');
          render_key(layer, k);
        }
      });
      $(key).append(remove_keycode);
    }
  }

});
