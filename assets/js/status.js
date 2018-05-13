export default checkStatus;

function checkStatus(backend_status_url) {
  $.get(backend_status_url)
    .then(json => {
      var localTime = new Date(json.last_ping).toTimeString();
      var stat = json.status;
      stat = stat === 'running' ? 'UP' : stat;
      $('.bes-status')
        .html(_.escape(`${stat} @ ${localTime}`))
        .removeClass('bes-error');
      $('.bes-version-num').html(_.escape(json.version));
      $('.bes-jobs').html(
        _.template('<%= queue_length %> job(s) running')(json)
      );
    })
    .fail(json => {
      var localTime = new Date().toTimeString();
      $('.bes-status')
        .html(`DOWN @ ${localTime}`)
        .addClass('bes-error');
      console.error('API status error', json);
    });
  setTimeout(_.partial(checkStatus, backend_status_url), getPollInterval());
}

function getPollInterval() {
  return 25000 + 5000 * Math.random();
}
