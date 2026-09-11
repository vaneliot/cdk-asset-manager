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
