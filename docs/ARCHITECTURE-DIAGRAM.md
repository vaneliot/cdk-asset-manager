``` mermaid
flowchart LR
    client((client))
    apigw[API Gateway]
    sqs[SQS]
    s3[(S3)]
    lambdaPutObject["Lambda PutObject"]
    decision{is deletion?}
    upsert["UpsertAssetV1 λ"]
    delete["DeleteAssetV1 λ"]
    dynamo[(DynamoDB)]

    client -->|"Cognito checks whether request can be allowed"| apigw
    apigw -->|"{file: cat.jpg, name: cat, description: meow}"| sqs
    sqs -->|handle file upload| lambdaPutObject
    lambdaPutObject -->|put file| s3
    s3 -->|publish file change event| decision
    decision -->|n| upsert
    decision -->|y| delete
    upsert --> dynamo
    delete --> dynamo
```

## v2 — presigned URL upload (file bytes never pass through our infra)

``` mermaid
flowchart LR
    client((client))

    subgraph leg1["Leg 1 -- request upload clearance"]
        apigw[API Gateway]
        getUrl["GetPresignedUploadUrlV1 λ"]
    end

    subgraph leg2["Leg 2 -- direct upload, no queue/lambda in the middle"]
        s3[(S3)]
    end

    subgraph leg3["Leg 3 -- fires only once the file actually lands"]
        decision{is deletion?}
        upsert["UpsertAssetV1 λ"]
        delete["DeleteAssetV1 λ"]
        dynamo[(DynamoDB)]
    end

    client -->|"Cognito checks whether request can be allowed<br/>{name, description, filename}"| apigw
    apigw --> getUrl
    getUrl -->|"presigned PUT URL (time-limited)"| client
    client -->|"PUT file bytes straight to S3"| s3
    s3 -->|publish file change event| decision
    decision -->|n| upsert
    decision -->|y| delete
    upsert --> dynamo
    delete --> dynamo
```

Notes on v2:
- **Leg 1** is metadata-only — no file bytes cross API Gateway, SQS, or any Lambda. `GetPresignedUploadUrlV1` calls S3's SDK to mint a presigned PUT URL for a specific key and returns it to the client.
- **Leg 2** is the client talking directly to S3 with that URL. Nothing of ours sits in this path — no size ceilings from API Gateway/SQS/Lambda apply here.
- **Leg 3** is unchanged from v1's tail end, but note the trigger: it only fires when the file actually finishes uploading, which can be any amount of time after leg 1 completed (or never, if the client discards the URL).
- SQS is dropped from the upload path entirely in this version — each file lands in S3 independently and fires its own event, so there's nothing left to queue on the "get clearance" leg. It could still reappear between S3's event and `UpsertAssetV1`/`DeleteAssetV1` in leg 3 if retry/backpressure is wanted there, but that's a different role than v1's SQS.

## v3 — Cognito auth + retrieval added

``` mermaid
flowchart LR
    client((client))

    subgraph auth["Auth -- once, before anything else"]
        hostedui["Cognito Hosted UI<br/>(sign up / sign in)"]
    end

    subgraph leg1["Leg 1 -- request upload clearance"]
        apigw{{"API Gateway<br/>(JWT authorizer on every route)"}}
        getUrl["GetPresignedUploadUrlV1 λ"]
    end

    subgraph leg2["Leg 2 -- direct upload, no queue/lambda in the middle"]
        s3[(S3)]
    end

    subgraph leg3["Leg 3 -- fires only once the file actually lands"]
        decision{is deletion?}
        upsert["UpsertAssetV1 λ"]
        delete["DeleteAssetV1 λ"]
        dynamo[(DynamoDB)]
    end

    subgraph leg4["Leg 4 -- retrieval, mirrors leg 1's shape"]
        getAsset["GetAssetV1 λ"]
    end

    client -->|"sign up / sign in"| hostedui
    hostedui -->|"JWT (access token)"| client

    client -->|"POST /create-upload-url<br/>Authorization: Bearer JWT<br/>{name, description, filename}"| apigw
    apigw -->|"authorizer OK"| getUrl
    getUrl -->|"presigned PUT URL (time-limited)"| client
    client -->|"PUT file bytes straight to S3"| s3
    s3 -->|publish file change event| decision
    decision -->|n| upsert
    decision -->|y| delete
    upsert --> dynamo
    delete --> dynamo

    client -->|"GET /assets/:key<br/>Authorization: Bearer JWT"| apigw
    apigw -->|"authorizer OK"| getAsset
    getAsset -->|"lookup metadata"| dynamo
    getAsset -->|"presigned GET URL (time-limited)"| client
    client -->|"GET file bytes straight from S3"| s3
```

Notes on v3:
- **Auth is a separate step, not baked into "request clearance" anymore.** v1/v2 hand-waved this as "Cognito checks whether request can be allowed" on the arrow into API Gateway. In reality it's two distinct things: a client signs in *once* via Cognito's Hosted UI to get a JWT, then attaches that JWT to every subsequent API call — API Gateway's JWT authorizer checks it on each request, independent of the Hosted UI itself.
- **The authorizer sits in front of every route**, not just the upload one — shown as a single gate (`defaultAuthorizer` on the `HttpApi`) rather than duplicating the check per leg. A request with a missing/invalid/expired JWT never reaches a Lambda at all — it's rejected `401` at the gate.
- **Leg 4 (retrieval) mirrors leg 1's shape on purpose:** both mint a short-lived presigned S3 URL (PUT for upload, GET for download) and hand it to the client rather than proxying file bytes through Lambda — same reasoning, same size-limit avoidance, opposite direction.
- **DynamoDB now serves two roles**, not one: it's still kept in sync by leg 3 (the S3-event-reactive `UpsertAssetV1`/`DeleteAssetV1`), and it's now also read by leg 4 to look up metadata and (eventually) verify the requesting user owns the asset before minting a download URL.
- SQS remains dropped, same reasoning as v2.

### v3, as sequence diagrams (one per feature)

The flowchart above shows how the pieces connect; these show the actual order of calls and who's waiting on whom — useful for spotting things like "the presigned URL is signed locally, no network round-trip to S3 happens at that step."

**Auth**

``` mermaid
sequenceDiagram
    actor Client
    participant HostedUI as Cognito Hosted UI
    participant Token as Cognito /oauth2/token

    Client->>HostedUI: Visit sign-in URL, sign up / sign in
    HostedUI-->>Client: Redirect to callback with ?code=...
    Client->>Token: POST /oauth2/token (grant_type=authorization_code, code)
    Token-->>Client: access_token, id_token, refresh_token
    Note over Client: Attach access_token as<br/>Authorization: Bearer on every API call below
```

**Upload**

``` mermaid
sequenceDiagram
    actor Client
    participant APIGW as API Gateway
    participant Lambda as GetPresignedUploadUrlV1
    participant S3

    Client->>APIGW: POST /create-upload-url<br/>Authorization: Bearer JWT
    APIGW->>APIGW: JWT authorizer check
    alt token missing/invalid
        APIGW-->>Client: 401 Unauthorized
    else token valid
        APIGW->>Lambda: invoke
        Note over Lambda,S3: getSignedUrl() is local signing,<br/>no network call to S3 here
        Lambda-->>APIGW: 200 { url, key }
        APIGW-->>Client: 200 { url, key }
        Client->>S3: PUT file bytes to presigned url
        S3-->>Client: 200
    end
```

**Sync** (reactive — no client involved)

``` mermaid
sequenceDiagram
    participant S3
    participant Lambda as UpsertAssetV1 / DeleteAssetV1
    participant Dynamo as DynamoDB

    S3->>S3: Object created or removed
    S3->>Lambda: Event notification
    alt object created
        Lambda->>Dynamo: PutItem { asset_key, created_at }
    else object removed
        Lambda->>Dynamo: DeleteItem { asset_key }
    end
```

**Retrieval**

``` mermaid
sequenceDiagram
    actor Client
    participant APIGW as API Gateway
    participant Lambda as GetAssetV1
    participant Dynamo as DynamoDB
    participant S3

    Client->>APIGW: GET /assets/:key<br/>Authorization: Bearer JWT
    APIGW->>APIGW: JWT authorizer check
    alt token missing/invalid
        APIGW-->>Client: 401 Unauthorized
    else token valid
        APIGW->>Lambda: invoke
        Lambda->>Dynamo: GetItem { asset_key }
        alt not found
            Dynamo-->>Lambda: no item
            Lambda-->>APIGW: 404
            APIGW-->>Client: 404
        else found
            Dynamo-->>Lambda: item
            Note over Lambda,S3: getSignedUrl() is local signing,<br/>no network call to S3 here either
            Lambda-->>APIGW: 200 { ...asset, downloadUrl }
            APIGW-->>Client: 200 { ...asset, downloadUrl }
            Client->>S3: GET file bytes from presigned url
            S3-->>Client: 200
        end
    end
```
