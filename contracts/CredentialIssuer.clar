(define-constant ERR-NOT-AUTHORIZED u100)
(define-constant ERR-INVALID-USER-ID u101)
(define-constant ERR-INVALID-SKILL-ID u102)
(define-constant ERR-INVALID-PROOF-HASH u103)
(define-constant ERR-INVALID-EXPIRATION u104)
(define-constant ERR-INVALID-METADATA u105)
(define-constant ERR-CREDENTIAL-ALREADY-EXISTS u106)
(define-constant ERR-CREDENTIAL-NOT-FOUND u107)
(define-constant ERR-INVALID-ISSUANCE-TIMESTAMP u108)
(define-constant ERR-AUTHORITY-NOT-VERIFIED u109)
(define-constant ERR-INVALID-ISSUER u110)
(define-constant ERR-INVALID-BATCH-SIZE u111)
(define-constant ERR-UPDATE-NOT-ALLOWED u112)
(define-constant ERR-INVALID-UPDATE-PARAM u113)
(define-constant ERR-MAX-CREDENTIALS-EXCEEDED u114)
(define-constant ERR-INVALID-CREDENTIAL-TYPE u115)
(define-constant ERR-INVALID-LEVEL u116)
(define-constant ERR-INVALID-PREREQUISITES u117)
(define-constant ERR-INVALID-LOCATION u118)
(define-constant ERR-INVALID-CURRENCY u119)
(define-constant ERR-INVALID-STATUS u120)
(define-constant ERR-INVALID-ENDORSER u121)
(define-constant ERR-INVALID-RENEWAL-PERIOD u122)
(define-constant ERR-INVALID-TRANSFER-FEE u123)
(define-constant ERR-TRANSFER-NOT-ALLOWED u124)
(define-constant ERR-INVALID-OWNER u125)

(define-data-var next-credential-id uint u0)
(define-data-var max-credentials uint u10000)
(define-data-var issuance-fee uint u500)
(define-data-var authority-contract (optional principal) none)
(define-data-var transfer-fee uint u100)

(define-map credentials
  uint
  {
    user-id: uint,
    skill-id: uint,
    proof-hash: (buff 32),
    issuance-timestamp: uint,
    expiration: (optional uint),
    metadata: (string-utf8 256),
    issuer: principal,
    credential-type: (string-utf8 50),
    level: uint,
    prerequisites: (list 10 uint),
    location: (string-utf8 100),
    currency: (string-utf8 20),
    status: bool,
    endorsers: (list 5 principal)
  }
)

(define-map credentials-by-user
  uint
  (list 50 uint)
)

(define-map credentials-by-skill
  uint
  (list 50 uint)
)

(define-map credential-updates
  uint
  {
    update-metadata: (string-utf8 256),
    update-timestamp: uint,
    updater: principal
  }
)

(define-read-only (get-credential (id uint))
  (map-get? credentials id)
)

(define-read-only (get-credential-updates (id uint))
  (map-get? credential-updates id)
)

(define-read-only (is-credential-issued (user-id uint) (skill-id uint))
  (is-some (fold check-credential-match (map-get? credentials-by-user user-id) (some {found: false, skill-id: skill-id})))
)

(define-private (check-credential-match (cred-id uint) (state (optional {found: bool, skill-id: uint})))
  (match state
    s
    (let ((cred (unwrap-panic (get-credential cred-id))))
      (if (is-eq (get skill-id cred) (get skill-id s))
        (some {found: true, skill-id: (get skill-id s)})
        state
      )
    )
    none
  )
)

(define-private (validate-user-id (user uint))
  (if (> user u0)
    (ok true)
    (err ERR-INVALID-USER-ID)
  )
)

(define-private (validate-skill-id (skill uint))
  (if (> skill u0)
    (ok true)
    (err ERR-INVALID-SKILL-ID)
  )
)

(define-private (validate-proof-hash (hash (buff 32)))
  (if (is-eq (len hash) u32)
    (ok true)
    (err ERR-INVALID-PROOF-HASH)
  )
)

(define-private (validate-expiration (exp (optional uint)))
  (match exp
    e (if (> e block-height) (ok true) (err ERR-INVALID-EXPIRATION))
    (ok true)
  )
)

(define-private (validate-metadata (meta (string-utf8 256)))
  (if (<= (len meta) u256)
    (ok true)
    (err ERR-INVALID-METADATA)
  )
)

(define-private (validate-credential-type (type (string-utf8 50)))
  (if (or (is-eq type "vocational") (is-eq type "skill") (is-eq type "certification"))
    (ok true)
    (err ERR-INVALID-CREDENTIAL-TYPE)
  )
)

(define-private (validate-level (level uint))
  (if (and (>= level u1) (<= level u5))
    (ok true)
    (err ERR-INVALID-LEVEL)
  )
)

(define-private (validate-prerequisites (prereqs (list 10 uint)))
  (ok true)
)

(define-private (validate-location (loc (string-utf8 100)))
  (if (<= (len loc) u100)
    (ok true)
    (err ERR-INVALID-LOCATION)
  )
)

(define-private (validate-currency (cur (string-utf8 20)))
  (if (or (is-eq cur "STX") (is-eq cur "USD"))
    (ok true)
    (err ERR-INVALID-CURRENCY)
  )
)

(define-private (validate-endorsers (endorsers (list 5 principal)))
  (ok true)
)

(define-private (validate-issuer (issuer principal))
  (if (not (is-eq issuer 'SP000000000000000000002Q6VF78))
    (ok true)
    (err ERR-INVALID-ISSUER)
  )
)

(define-public (set-authority-contract (contract-principal principal))
  (begin
    (try! (validate-issuer contract-principal))
    (asserts! (is-none (var-get authority-contract)) (err ERR-AUTHORITY-NOT-VERIFIED))
    (var-set authority-contract (some contract-principal))
    (ok true)
  )
)

(define-public (set-issuance-fee (new-fee uint))
  (begin
    (asserts! (>= new-fee u0) (err ERR-INVALID-UPDATE-PARAM))
    (asserts! (is-some (var-get authority-contract)) (err ERR-AUTHORITY-NOT-VERIFIED))
    (var-set issuance-fee new-fee)
    (ok true)
  )
)

(define-public (set-transfer-fee (new-fee uint))
  (begin
    (asserts! (>= new-fee u0) (err ERR-INVALID-UPDATE-PARAM))
    (asserts! (is-some (var-get authority-contract)) (err ERR-AUTHORITY-NOT-VERIFIED))
    (var-set transfer-fee new-fee)
    (ok true)
  )
)

(define-public (issue-credential
  (user-id uint)
  (skill-id uint)
  (proof-hash (buff 32))
  (expiration (optional uint))
  (metadata (string-utf8 256))
  (credential-type (string-utf8 50))
  (level uint)
  (prerequisites (list 10 uint))
  (location (string-utf8 100))
  (currency (string-utf8 20))
  (endorsers (list 5 principal))
)
  (let (
    (next-id (var-get next-credential-id))
    (current-max (var-get max-credentials))
    (authority (var-get authority-contract))
  )
    (asserts! (< next-id current-max) (err ERR-MAX-CREDENTIALS-EXCEEDED))
    (try! (validate-user-id user-id))
    (try! (validate-skill-id skill-id))
    (try! (validate-proof-hash proof-hash))
    (try! (validate-expiration expiration))
    (try! (validate-metadata metadata))
    (try! (validate-credential-type credential-type))
    (try! (validate-level level))
    (try! (validate-prerequisites prerequisites))
    (try! (validate-location location))
    (try! (validate-currency currency))
    (try! (validate-endorsers endorsers))
    (asserts! (not (unwrap-panic (is-credential-issued user-id skill-id))) (err ERR-CREDENTIAL-ALREADY-EXISTS))
    (let ((authority-recipient (unwrap! authority (err ERR-AUTHORITY-NOT-VERIFIED))))
      (try! (stx-transfer? (var-get issuance-fee) tx-sender authority-recipient))
    )
    (map-set credentials next-id
      {
        user-id: user-id,
        skill-id: skill-id,
        proof-hash: proof-hash,
        issuance-timestamp: block-height,
        expiration: expiration,
        metadata: metadata,
        issuer: tx-sender,
        credential-type: credential-type,
        level: level,
        prerequisites: prerequisites,
        location: location,
        currency: currency,
        status: true,
        endorsers: endorsers
      }
    )
    (map-set credentials-by-user user-id (append (default-to (list) (map-get? credentials-by-user user-id)) next-id))
    (map-set credentials-by-skill skill-id (append (default-to (list) (map-get? credentials-by-skill skill-id)) next-id))
    (var-set next-credential-id (+ next-id u1))
    (print { event: "credential-issued", id: next-id })
    (ok next-id)
  )
)

(define-public (update-credential
  (cred-id uint)
  (update-metadata (string-utf8 256))
)
  (let ((cred (map-get? credentials cred-id)))
    (match cred
      c
      (begin
        (asserts! (is-eq (get issuer c) tx-sender) (err ERR-NOT-AUTHORIZED))
        (try! (validate-metadata update-metadata))
        (map-set credentials cred-id
          (merge c { metadata: update-metadata })
        )
        (map-set credential-updates cred-id
          {
            update-metadata: update-metadata,
            update-timestamp: block-height,
            updater: tx-sender
          }
        )
        (print { event: "credential-updated", id: cred-id })
        (ok true)
      )
      (err ERR-CREDENTIAL-NOT-FOUND)
    )
  )
)

(define-public (transfer-credential (cred-id uint) (new-owner uint))
  (let ((cred (map-get? credentials cred-id)))
    (match cred
      c
      (begin
        (asserts! (is-eq (get user-id c) (unwrap-panic (as-contract tx-sender))) (err ERR-NOT-AUTHORIZED))
        (let ((authority (unwrap! (var-get authority-contract) (err ERR-AUTHORITY-NOT-VERIFIED))))
          (try! (stx-transfer? (var-get transfer-fee) tx-sender authority))
        )
        (map-delete credentials-by-user (get user-id c))
        (map-set credentials cred-id (merge c { user-id: new-owner }))
        (map-set credentials-by-user new-owner (append (default-to (list) (map-get? credentials-by-user new-owner)) cred-id))
        (print { event: "credential-transferred", id: cred-id, new-owner: new-owner })
        (ok true)
      )
      (err ERR-CREDENTIAL-NOT-FOUND)
    )
  )
)

(define-public (get-credential-count)
  (ok (var-get next-credential-id))
)

(define-public (check-credential-existence (user-id uint) (skill-id uint))
  (ok (unwrap-panic (is-credential-issued user-id skill-id)))
)