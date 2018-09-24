import http from 'http';
import url from 'url';

import opentracing from 'opentracing';
import lightstep from 'lightstep-tracer';

const {
  DOCKER_TRACER_PORT,
  DOCKER_TRACER_NEXT_HOST,
  DOCKER_TRACER_NEXT_PORT,
  LIGHTSTEP_COMPONENT_NAME,
  LIGHTSTEP_ACCESS_TOKEN,
  LIGHTSTEP_COLLECTOR_HOST,
  LIGHTSTEP_COLLECTOR_PORT,
  LIGHTSTEP_VERBOSITY
} = process.env;

const tracer = new lightstep.Tracer({
  access_token: LIGHTSTEP_ACCESS_TOKEN,
  component_name: LIGHTSTEP_COMPONENT_NAME,
  collector_port: parseInt(LIGHTSTEP_COLLECTOR_PORT),
  collector_host: LIGHTSTEP_COLLECTOR_HOST,
  verbosity: parseInt(LIGHTSTEP_VERBOSITY)
});
opentracing.initGlobalTracer(tracer);

const server = http.createServer().listen(DOCKER_TRACER_PORT);

server.on('request', function (request, response) {
  console.log('docker tracer start');
  const globalTracer = opentracing.globalTracer();
  const requestHeaders = Object.assign({}, request.headers);
  const context = globalTracer.extract(
    opentracing.FORMAT_HTTP_HEADERS,
    requestHeaders
  );
  const span = globalTracer.startSpan("http_request", { childOf: context });
  span.setTag("http.method", request.method);
  span.setTag("http.url", request.url);
  span.setTag("http.path", request.path);
  span.setTag("http.host", request.host);

  try {
    const options = url.parse(`${DOCKER_TRACER_NEXT_HOST}:${DOCKER_TRACER_NEXT_PORT}${request.url}`);
    options.headers = request.headers;
    options.method = request.method;
    options.agent = false;

    const connector = http.request(options, serverResponse => {
      response.writeHeader(serverResponse.statusCode, serverResponse.headers);
      serverResponse.pipe(response);
      console.info('response', response);
    });
    request.pipe(connector);
    connector.on("end", () => {
      span.setTag("http.status_code", response.statusCode);
      span.finish();
    });
  } catch (err) {
    response.statusCode = 500;
    response.write(JSON.stringify(err));
    response.end();
    span.setTag("http.status_code", response.statusCode);
    span.finish();
  }
});