$(document).ready(function() {
  chrome.storage.local.get(['rpc.host', 'rpc.username', 'rpc.password'], function(config) {
    $('#host').val(config['rpc.host']);
    $('#username').val(config['rpc.username']);
    $('#password').val(config['rpc.password']);
  })

  $('#host').change(function() {
    chrome.storage.local.set({'rpc.host': $('#host').val()});
  });

  $('#username').change(function() {
    chrome.storage.local.set({'rpc.username': $('#username').val()});
  });

  $('#password').change(function() {
    chrome.storage.local.set({'rpc.password': $('#password').val()});
  });

  $('#test').click(function() {
    chrome.storage.local.get(['rpc.host', 'rpc.username', 'rpc.password'], function(config) {
      if (_.isUndefined(config['rpc.username']) || config['rpc.username'] == '') {
        alert('Username is not specified')
      } else
      if (_.isUndefined(config['rpc.password']) || config['rpc.password'] == '') {
        alert('Password is not specified')
      } else
      $.ajax({
          type: 'POST',
          url: 'http://'+config['rpc.username']+':'+config['rpc.password']+'@'+config['rpc.host']+'/',
          data: JSON.stringify({'jsonrpc': '1.0', 'id': 1, 'method': 'getinfo', 'params': []}),
          success: function(data) {
            alert('Connection successful')
          },
          error: function(e) {
            alert('Connection failed: ' + e.statusText)
          },
          contentType: "application/json",
          dataType: 'json'
      });
    });
  });
});
