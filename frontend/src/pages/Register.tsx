import { useState } from 'react';
import { useRegistration } from '../hooks/useRegistration';
import { loadSecret, clearSecret, saveSecret } from '../lib/secret-storage';
import { generateCommitment } from 'zk-opengov-client-lib';
import { getRegistryContract } from '../lib/contracts';

interface RegisterProps {
    account: string | null;
    isConnected: boolean;
    onConnect: () => Promise<void>;
}

export default function Register({ account, isConnected, onConnect }: RegisterProps) {
    const registration = useRegistration(account);
    const [showSecret, setShowSecret] = useState(false);
    const [copied, setCopied] = useState(false);
    const [showClearConfirm, setShowClearConfirm] = useState(false);
    const [secretInput, setSecretInput] = useState('');
    const [restoreError, setRestoreError] = useState<string | null>(null);
    const [isValidating, setIsValidating] = useState(false);

    const handleRestoreSecret = async () => {
        setRestoreError(null);
        const trimmed = secretInput.trim();
        if (!trimmed) {
            setRestoreError('Please enter your secret.');
            return;
        }

        let secret: bigint;
        try {
            secret = BigInt(trimmed);
            if (secret <= 0n) {
                setRestoreError('Invalid secret value.');
                return;
            }
        } catch {
            setRestoreError('Invalid secret. Must be a numeric value.');
            return;
        }

        if (!account) {
            setRestoreError('Connect your wallet first.');
            return;
        }

        setIsValidating(true);
        try {
            // Compute Poseidon(secret) and compare against on-chain commitment
            const commitment = await generateCommitment(secret);
            const commitmentHex = '0x' + commitment.toString(16).padStart(64, '0');

            const registry = getRegistryContract();
            const count = Number(await registry.getRegistrationCount());
            const addrLower = account.toLowerCase();

            let onChainCommitment: string | null = null;
            for (let i = 0; i < count; i++) {
                const [regAccount, regCommitment] = await registry.getRegistration(i);
                if (regAccount.toLowerCase() === addrLower) {
                    onChainCommitment = regCommitment.toLowerCase();
                    break;
                }
            }

            if (!onChainCommitment) {
                setRestoreError('No registration found for this address on-chain.');
                return;
            }

            if (onChainCommitment !== commitmentHex.toLowerCase()) {
                setRestoreError('Secret does not match your on-chain registration.');
                return;
            }

            // Valid — save and reload
            saveSecret(secret);
            window.location.reload();
        } catch (err) {
            setRestoreError(err instanceof Error ? err.message : 'Validation failed.');
        } finally {
            setIsValidating(false);
        }
    };

    const handleCopy = async (text: string) => {
        try {
            await navigator.clipboard.writeText(text);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch {
            // Fallback for older browsers
            const el = document.createElement('textarea');
            el.value = text;
            document.body.appendChild(el);
            el.select();
            document.execCommand('copy');
            document.body.removeChild(el);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        }
    };

    const handleClearSecret = () => {
        clearSecret();
        setShowClearConfirm(false);
        window.location.reload();
    };

    const existingSecret = loadSecret();

    return (
        <div className="page page-register">
            <h1 className="page-title">Voter Registration</h1>
            <p className="page-subtitle">
                Register to participate in private governance voting.
                This is a one-time process that generates your secret key
                and records your commitment on-chain.
            </p>

            <div className="register-steps">
                {/* Step 1: Connect Wallet */}
                <div className={`register-step ${isConnected ? 'step-complete' : 'step-active'}`}>
                    <div className="step-header">
                        <span className="step-number">
                            {isConnected ? '\u2713' : '1'}
                        </span>
                        <h3 className="step-title">Connect Wallet</h3>
                    </div>
                    <div className="step-content">
                        {isConnected ? (
                            <div className="step-status">
                                <span className="status-connected" />
                                Connected: <code>{account}</code>
                            </div>
                        ) : (
                            <div className="step-action">
                                <p>Connect your MetaMask wallet to begin registration.</p>
                                <button className="btn btn-primary" onClick={onConnect}>
                                    Connect Wallet
                                </button>
                            </div>
                        )}
                    </div>
                </div>

                {/* Step 2: Check Registration */}
                <div
                    className={`register-step ${
                        !isConnected
                            ? 'step-disabled'
                            : registration.isRegistered || registration.hasStoredSecret
                              ? 'step-complete'
                              : 'step-active'
                    }`}
                >
                    <div className="step-header">
                        <span className="step-number">
                            {registration.isRegistered || registration.hasStoredSecret
                                ? '\u2713'
                                : '2'}
                        </span>
                        <h3 className="step-title">Registration Status</h3>
                    </div>
                    <div className="step-content">
                        {!isConnected ? (
                            <p className="step-disabled-text">
                                Connect your wallet first.
                            </p>
                        ) : registration.isRegistered ? (
                            <div className="step-status step-status-success">
                                <span className="status-icon">&#10003;</span>
                                <span>
                                    This address is already registered on-chain.
                                </span>
                            </div>
                        ) : registration.hasStoredSecret ? (
                            <div className="step-status step-status-warning">
                                <span className="status-icon">&#9888;</span>
                                <span>
                                    You have a stored secret from a previous registration.
                                    If your on-chain registration is complete, you are ready to vote.
                                </span>
                            </div>
                        ) : (
                            <div className="step-status step-status-pending">
                                <span className="status-icon">&#9679;</span>
                                <span>Not registered yet. Proceed to step 3.</span>
                            </div>
                        )}
                    </div>
                </div>

                {/* Step 3: Generate Secret & Register */}
                <div
                    className={`register-step ${
                        !isConnected
                            ? 'step-disabled'
                            : registration.isRegistered && registration.hasStoredSecret
                              ? 'step-complete'
                              : 'step-active'
                    }`}
                >
                    <div className="step-header">
                        <span className="step-number">
                            {(registration.txHash || (registration.isRegistered && registration.hasStoredSecret)) ? '\u2713' : '3'}
                        </span>
                        <h3 className="step-title">Generate Secret & Register</h3>
                    </div>
                    <div className="step-content">
                        {!isConnected ? (
                            <p className="step-disabled-text">
                                Connect your wallet first.
                            </p>
                        ) : registration.isRegistered && registration.hasStoredSecret && !registration.generatedSecret ? (
                            <div className="step-status step-status-success">
                                <span className="status-icon">&#10003;</span>
                                <span>
                                    On-chain registration complete.
                                    {registration.registrationIndex >= 0 && !registration.isTreeReady
                                        ? ' Waiting for tree inclusion below...'
                                        : ' You can now vote on proposals.'}
                                </span>
                            </div>
                        ) : registration.isRegistered && !registration.hasStoredSecret ? (
                            <div>
                                <div className="register-warning register-warning-critical">
                                    <div className="warning-icon">&#128680;</div>
                                    <div className="warning-content">
                                        <strong>Secret not found.</strong> Your address is registered
                                        on-chain but no secret is stored in this browser.
                                        Without your secret, you cannot vote. Paste your backup below to restore it.
                                    </div>
                                </div>
                                <div className="restore-secret">
                                    <input
                                        type="text"
                                        className="input-secret"
                                        placeholder="Paste your secret here..."
                                        value={secretInput}
                                        onChange={(e) => setSecretInput(e.target.value)}
                                    />
                                    <button
                                        className="btn btn-primary btn-sm"
                                        onClick={handleRestoreSecret}
                                        disabled={isValidating}
                                    >
                                        {isValidating ? (
                                            <>
                                                <span className="spinner spinner-sm" />
                                                Validating...
                                            </>
                                        ) : (
                                            'Restore Secret'
                                        )}
                                    </button>
                                    {restoreError && (
                                        <div className="error-box">
                                            <span className="error-icon">&#10007;</span>
                                            <span>{restoreError}</span>
                                        </div>
                                    )}
                                </div>
                            </div>
                        ) : (
                            <>
                                <div className="register-warning">
                                    <div className="warning-icon">&#9888;</div>
                                    <div className="warning-content">
                                        <strong>Important:</strong> The registration process will
                                        generate a unique secret key. This key is stored in your
                                        browser and is required for voting. Save a backup copy in
                                        a secure location. Each address can only register once.
                                    </div>
                                </div>

                                {!registration.generatedSecret && !registration.txHash && (
                                    <button
                                        className="btn btn-primary btn-lg"
                                        onClick={registration.register}
                                        disabled={registration.isRegistering}
                                    >
                                        {registration.isRegistering ? (
                                            <>
                                                <span className="spinner spinner-sm" />
                                                Registering...
                                            </>
                                        ) : (
                                            'Generate Secret & Register'
                                        )}
                                    </button>
                                )}

                                {registration.error && (
                                    <div className="error-box">
                                        <span className="error-icon">&#10007;</span>
                                        <span>{registration.error}</span>
                                    </div>
                                )}
                            </>
                        )}
                    </div>
                </div>

                {/* Step 4: Secret Display (only after generation) */}
                {registration.generatedSecret && (
                    <div className="register-step step-active step-highlight">
                        <div className="step-header">
                            <span className="step-number">4</span>
                            <h3 className="step-title">Your Secret Key</h3>
                        </div>
                        <div className="step-content">
                            <div className="secret-display">
                                <div className="register-warning register-warning-critical">
                                    <div className="warning-icon">&#128680;</div>
                                    <div className="warning-content">
                                        <strong>Save this secret NOW!</strong> It is stored in
                                        your browser's localStorage, but clearing browser data
                                        will erase it. Copy it to a secure location.
                                        Each address can only register once — if you lose your
                                        secret, you will not be able to vote.
                                    </div>
                                </div>

                                <div className="secret-value-container">
                                    <label className="secret-label">
                                        Your secret (click to reveal):
                                    </label>
                                    <div className="secret-value">
                                        {showSecret ? (
                                            <code className="secret-code">
                                                {registration.generatedSecret}
                                            </code>
                                        ) : (
                                            <button
                                                className="btn btn-outline btn-sm"
                                                onClick={() => setShowSecret(true)}
                                            >
                                                Click to reveal secret
                                            </button>
                                        )}
                                    </div>
                                    {showSecret && (
                                        <button
                                            className="btn btn-primary btn-sm"
                                            onClick={() =>
                                                handleCopy(
                                                    registration.generatedSecret!
                                                )
                                            }
                                        >
                                            {copied ? 'Copied!' : 'Copy to Clipboard'}
                                        </button>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* Step 5: On-chain Confirmation */}
                {registration.txHash && (
                    <div className="register-step step-complete">
                        <div className="step-header">
                            <span className="step-number">&#10003;</span>
                            <h3 className="step-title">On-chain Confirmation</h3>
                        </div>
                        <div className="step-content">
                            <div className="tx-confirmation">
                                <p>Your commitment has been recorded on-chain.</p>
                                <div className="tx-hash-display">
                                    <span className="tx-label">Transaction:</span>
                                    <code className="tx-hash">{registration.txHash}</code>
                                </div>
                                {registration.registrationIndex >= 0 && (
                                    <p className="tx-detail">
                                        Registration index: <strong>#{registration.registrationIndex}</strong>
                                    </p>
                                )}
                            </div>
                        </div>
                    </div>
                )}

                {/* Step 6: Tree Inclusion — show after fresh registration OR on reload with stored index */}
                {(registration.txHash || registration.registrationIndex >= 0) && (
                    <div className={`register-step ${registration.isTreeReady ? 'step-complete' : 'step-active'}`}>
                        <div className="step-header">
                            <span className="step-number">
                                {registration.isTreeReady ? '\u2713' : '6'}
                            </span>
                            <h3 className="step-title">Ownership Tree Inclusion</h3>
                        </div>
                        <div className="step-content">
                            {registration.isTreeReady ? (
                                <div className="step-status step-status-success">
                                    <span className="status-icon">&#10003;</span>
                                    <span>
                                        Your registration is included in the on-chain ownership tree.
                                        You can now vote on any active proposal. Head to the{' '}
                                        <a href="/proposals">Proposals</a> page to get started.
                                    </span>
                                </div>
                            ) : registration.isWaitingForTree ? (
                                <div className="step-status step-status-pending">
                                    <span className="spinner spinner-sm" />
                                    <span>
                                        Waiting for the tree builder to include your registration
                                        (index #{registration.registrationIndex}).
                                        This happens automatically — polling every 10 seconds...
                                    </span>
                                </div>
                            ) : (
                                <div className="step-status step-status-pending">
                                    <span className="status-icon">&#9679;</span>
                                    <span>
                                        The ownership tree will be rebuilt to include your registration.
                                    </span>
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>

            {/* Existing secret management */}
            {existingSecret !== null && !registration.generatedSecret && (
                <div className="secret-management">
                    <h3>Stored Secret</h3>
                    <p>
                        You have a secret stored in this browser from a previous registration.
                    </p>
                    <div className="secret-actions">
                        <button
                            className="btn btn-outline btn-sm"
                            onClick={() => {
                                setShowSecret(!showSecret);
                            }}
                        >
                            {showSecret ? 'Hide Secret' : 'View Stored Secret'}
                        </button>
                        {showSecret && (
                            <>
                                <code className="secret-code secret-code-inline">
                                    {existingSecret.toString()}
                                </code>
                                <button
                                    className="btn btn-primary btn-sm"
                                    onClick={() =>
                                        handleCopy(existingSecret.toString())
                                    }
                                >
                                    {copied ? 'Copied!' : 'Copy'}
                                </button>
                            </>
                        )}
                    </div>
                    <div className="secret-danger-zone">
                        {showClearConfirm ? (
                            <div className="danger-confirm">
                                <p>
                                    Are you sure? This will permanently delete your secret from
                                    this browser. You will not be able to vote unless you have
                                    a backup.
                                </p>
                                <button
                                    className="btn btn-danger btn-sm"
                                    onClick={handleClearSecret}
                                >
                                    Yes, Delete Secret
                                </button>
                                <button
                                    className="btn btn-outline btn-sm"
                                    onClick={() => setShowClearConfirm(false)}
                                >
                                    Cancel
                                </button>
                            </div>
                        ) : (
                            <button
                                className="btn btn-outline btn-sm btn-danger-outline"
                                onClick={() => setShowClearConfirm(true)}
                            >
                                Clear Stored Secret
                            </button>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
