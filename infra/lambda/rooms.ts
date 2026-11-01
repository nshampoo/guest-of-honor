import { ConditionalCheckFailedException, DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DeleteCommand, DynamoDBDocumentClient, GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import { ApiGatewayManagementApiClient, GoneException, PostToConnectionCommand } from '@aws-sdk/client-apigatewaymanagementapi';
import { validateBoard } from '../../src/engine/board';
import { type ClientMsg, type Room, type ServerMsg, createRoom, handle, viewFor } from '../../src/engine/room';

type WebSocketEvent = {
  requestContext: { routeKey: string; connectionId: string; domainName: string; stage: string };
  body?: string;
};

const db = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const TABLE = process.env.TABLE!;
const LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const OK = { statusCode: 200 };

const expiresAt = () => Math.floor(Date.now() / 1000) + 24 * 60 * 60;
const newCode = () => Array.from({ length: 4 }, () => LETTERS[Math.floor(Math.random() * LETTERS.length)]).join('');

async function load(code: string): Promise<{ room: Room; version: number } | null> {
  const { Item } = await db.send(new GetCommand({ TableName: TABLE, Key: { pk: `ROOM#${code}`, sk: 'STATE' } }));
  return Item ? { room: JSON.parse(Item.data), version: Item.version } : null;
}

// Saves only if nobody else saved since we loaded (version check). Returns false on a conflict.
async function save(room: Room, version: number | null): Promise<boolean> {
  try {
    await db.send(
      new PutCommand({
        TableName: TABLE,
        Item: { pk: `ROOM#${room.code}`, sk: 'STATE', data: JSON.stringify(room), version: (version ?? 0) + 1, expiresAt: expiresAt() },
        ConditionExpression: version === null ? 'attribute_not_exists(pk)' : 'version = :v',
        ExpressionAttributeValues: version === null ? undefined : { ':v': version },
      }),
    );
    return true;
  } catch (e) {
    if (e instanceof ConditionalCheckFailedException) return false;
    throw e;
  }
}

async function roomOf(connId: string): Promise<string | undefined> {
  const { Item } = await db.send(new GetCommand({ TableName: TABLE, Key: { pk: `CONN#${connId}`, sk: 'ROOM' } }));
  return Item?.code;
}

// Load, apply, save; on a version conflict, reload and try again.
async function update(code: string, apply: (room: Room) => { room: Room; error?: string }) {
  for (let attempt = 0; attempt < 8; attempt++) {
    const stored = await load(code);
    if (!stored) return { error: 'Room not found.' };
    const result = apply(stored.room);
    if (result.error) return { error: result.error };
    if (await save(result.room, stored.version)) return { room: result.room };
  }
  throw new Error(`Room ${code} is too busy`);
}

export async function handler(event: WebSocketEvent) {
  const { routeKey, connectionId, domainName, stage } = event.requestContext;
  if (routeKey === '$connect') return OK;

  const api = new ApiGatewayManagementApiClient({ endpoint: `https://${domainName}/${stage}` });
  const post = async (connId: string, msg: ServerMsg) => {
    try {
      await api.send(new PostToConnectionCommand({ ConnectionId: connId, Data: JSON.stringify(msg) }));
      return true;
    } catch (e) {
      if (e instanceof GoneException) return false;
      throw e;
    }
  };

  let msg: ClientMsg;
  if (routeKey === '$disconnect') {
    msg = { t: 'leave' };
  } else {
    try {
      msg = JSON.parse(event.body ?? '');
    } catch {
      await post(connectionId, { t: 'error', message: 'Bad message.' });
      return OK;
    }
  }

  if (msg.t === 'create') {
    const errors = validateBoard(msg.board);
    if (errors.length) {
      await post(connectionId, { t: 'error', message: errors[0] });
      return OK;
    }
    let code = newCode();
    while (!(await save(createRoom(code, msg.board), null))) code = newCode();
    msg = { t: 'join', code, role: 'tv', id: 'tv' };
  }

  const code = msg.t === 'join' ? msg.code : await roomOf(connectionId);
  if (!code) {
    if (msg.t !== 'leave') await post(connectionId, { t: 'error', message: 'Room not found.' });
    return OK;
  }

  const now = Date.now();
  const result = await update(code, (room) => handle(room, connectionId, msg, now));
  if (result.error) {
    if (msg.t !== 'leave') await post(connectionId, { t: 'error', message: result.error });
    return OK;
  }
  if (msg.t === 'join') {
    await db.send(new PutCommand({ TableName: TABLE, Item: { pk: `CONN#${connectionId}`, sk: 'ROOM', code, expiresAt: expiresAt() } }));
  }
  if (msg.t === 'leave') {
    await db.send(new DeleteCommand({ TableName: TABLE, Key: { pk: `CONN#${connectionId}`, sk: 'ROOM' } }));
  }

  const room = result.room!;
  const ids = Object.keys(room.connections);
  const delivered = await Promise.all(ids.map((id) => post(id, { t: 'view', view: viewFor(room, id, now)! })));
  const gone = ids.filter((_, i) => !delivered[i]);
  if (gone.length) {
    await update(code, (r) => ({ room: gone.reduce((acc, id) => handle(acc, id, { t: 'leave' }, now).room, r) }));
  }
  return OK;
}
