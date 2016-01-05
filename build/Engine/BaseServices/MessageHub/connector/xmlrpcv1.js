/*
 * Модуль работы с XML-RPC API IRIS v1
 */
'use strict';

/**
 * Модуль работы с XML-RPC
 */
let xmlrpc = require('xmlrpc');
let cookie = require('cookie');

class XmlRpcApiV1 {
  constructor() {
    //super();
  }
  create(options) {
    let anyMethodName = '__anyIrisXmlRpcMethod';
    // Creates an XML-RPC server to listen to XML-RPC method calls
    this.server = xmlrpc.createServer({
      httpServer: options.httpServer,
      anyMethodName: anyMethodName
    });
    this.connector = options.connector;

    let that = this;
    this.server.on(anyMethodName, (err, params, callback, request, response) => {
      let methodName = params.splice(0, 1)[0];
      if (err) {
        console.error('Method call for \'%s\' failed: %s', methodName, err);
        callback(err);
        return;
      }
      that.handleRequest(methodName, params, callback, request, response).catch(err => {
        console.error(err);
        if ('undefined' !== err.stack) {
          console.error(err.stack);
        }
        callback(err);
      });
    });

    this.server.on('error', e => {
      if (e.code === 'EADDRINUSE') {
        console.error('Address in use');
      }
      console.error(e);
    });
    return this;
  }

  handleRequest(methodName, params, callback, request, response) {
    // упаковать это дело в событие для MessageHub,
    // отправить его и в промисе дождаться результата и
    // вызвать для него callback(error, result)

    // Если в запросе есть токен, пробросим его обратно в ответ
    let phpSessId = null;
    if ('undefined' !== typeof request.headers.cookie) {
      let cookies = cookie.parse(request.headers.cookie);
      if ('undefined' !== typeof cookies.PHPSESSID) {
        phpSessId = cookies.PHPSESSID;
      }
    }
    return this._getAuthToken(phpSessId, params).then(token => {
      if (!token) {
        callback('Failed to auth');
        return;
      }
      response.setHeader("Set-Cookie", ["PHPSESSID=" + token]);

      // теперь можно сделать реальный XML-RPC вызов метода
      let data = {
        destination: "xmlrpc.v1." + methodName,
        data: params,
        // в куке PHPSESSION пробрасывается 32-битный токен авторизации
        // чтобы для клиентов это выглядело как раньше
        token: token
      };
      return this.connector.sendMessage(data).then(result => {
        callback(null, result);
      });
    });
  }

  _getAuthToken(token, params) {
    if (token && '' !== token) {
      return Promise.resolve(token);
    }
    // нет авторизации! пытаемся выполнить вход
    // Если авторизации нет, то вызов считаем вызовом метода авторизации,
    // принимающим на вход два или три параметра:
    // login, password[, origin]

    if (!_.isArray(params) || params.length < 2) {
      console.error('Bad auth params:', params);
      throw new Error('Bad auth params');
    }
    let data = {
      username: params[0],
      password_hash: params[1],
      origin: ''
    };
    if (params.length > 2) {
      data.origin = params[2];
    }
    return this.connector.sendLoginMessage(data).then(result => {
      if (!result.value) {
        console.error('Failed to auth:', result.reason);
        return null;
      }
      return result.token;
    }).catch(err => {
      console.error('Failed to auth:', err);
      if ('undefined' !== err.stack) {
        console.error(err.stack);
      }
    });
  }

  getHttpHandler() {
    return this.server.requestHandler;
  }

}

module.exports = XmlRpcApiV1;