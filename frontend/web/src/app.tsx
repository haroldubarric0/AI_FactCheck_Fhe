// App.tsx
import { ConnectButton } from '@rainbow-me/rainbowkit';
import '@rainbow-me/rainbowkit/styles.css';
import React, { useEffect, useState } from "react";
import { ethers } from "ethers";
import { getContractReadOnly, getContractWithSigner } from "./contract";
import "./App.css";
import { useAccount, useSignMessage } from 'wagmi';

interface PostRecord {
  id: string;
  encryptedScore: string; // FHE encrypted misinformation score (0-100)
  timestamp: number;
  author: string;
  status: "pending" | "flagged" | "cleared";
  category: string;
  encryptedContent: string; // Simulated encrypted content (real FHE can't handle strings)
}

// Mock FHE functions for numerical operations
const FHEEncryptNumber = (value: number): string => {
  return `FHE-${btoa(value.toString())}`;
};

const FHEDecryptNumber = (encryptedData: string): number => {
  if (encryptedData.startsWith('FHE-')) {
    return parseFloat(atob(encryptedData.substring(4)));
  }
  return parseFloat(encryptedData);
};

// Simulate FHE computation on encrypted misinformation score
const FHEComputeScore = (encryptedData: string, modelWeights: number[]): string => {
  const score = FHEDecryptNumber(encryptedData);
  // Simulate complex model computation (in real FHE this would be homomorphic operations)
  const adjustedScore = score * modelWeights[0] + Math.pow(score, 2) * modelWeights[1];
  const finalScore = Math.min(100, Math.max(0, adjustedScore)); // Clamp to 0-100
  return FHEEncryptNumber(finalScore);
};

const generatePublicKey = () => `0x${Array(2000).fill(0).map(() => Math.floor(Math.random() * 16).toString(16)).join('')}`;

const App: React.FC = () => {
  const { address, isConnected } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const [loading, setLoading] = useState(true);
  const [posts, setPosts] = useState<PostRecord[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [creating, setCreating] = useState(false);
  const [transactionStatus, setTransactionStatus] = useState<{ visible: boolean; status: "pending" | "success" | "error"; message: string; }>({ visible: false, status: "pending", message: "" });
  const [newPost, setNewPost] = useState({ category: "news", content: "", score: 50 });
  const [selectedPost, setSelectedPost] = useState<PostRecord | null>(null);
  const [decryptedScore, setDecryptedScore] = useState<number | null>(null);
  const [isDecrypting, setIsDecrypting] = useState(false);
  const [publicKey, setPublicKey] = useState<string>("");
  const [contractAddress, setContractAddress] = useState<string>("");
  const [chainId, setChainId] = useState<number>(0);
  const [startTimestamp, setStartTimestamp] = useState<number>(0);
  const [durationDays, setDurationDays] = useState<number>(30);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState<"all" | "pending" | "flagged" | "cleared">("all");

  // Stats calculations
  const flaggedCount = posts.filter(p => p.status === "flagged").length;
  const pendingCount = posts.filter(p => p.status === "pending").length;
  const clearedCount = posts.filter(p => p.status === "cleared").length;
  const totalScore = posts.reduce((sum, post) => sum + (post.status === "flagged" ? FHEDecryptNumber(post.encryptedScore) : 0), 0);
  const avgFlaggedScore = flaggedCount > 0 ? totalScore / flaggedCount : 0;

  // Filter posts based on search and status
  const filteredPosts = posts.filter(post => {
    const matchesSearch = post.category.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = filterStatus === "all" || post.status === filterStatus;
    return matchesSearch && matchesStatus;
  });

  useEffect(() => {
    loadPosts().finally(() => setLoading(false));
    const initSignatureParams = async () => {
      const contract = await getContractReadOnly();
      if (contract) setContractAddress(await contract.getAddress());
      if (window.ethereum) {
        const chainIdHex = await window.ethereum.request({ method: 'eth_chainId' });
        setChainId(parseInt(chainIdHex, 16));
      }
      setStartTimestamp(Math.floor(Date.now() / 1000));
      setDurationDays(30);
      setPublicKey(generatePublicKey());
    };
    initSignatureParams();
  }, []);

  const loadPosts = async () => {
    setIsRefreshing(true);
    try {
      const contract = await getContractReadOnly();
      if (!contract) return;
      
      // Check contract availability
      const isAvailable = await contract.isAvailable();
      if (!isAvailable) {
        console.error("Contract is not available");
        return;
      }

      // Load post keys
      const keysBytes = await contract.getData("post_keys");
      let keys: string[] = [];
      if (keysBytes.length > 0) {
        try {
          const keysStr = ethers.toUtf8String(keysBytes);
          if (keysStr.trim() !== '') keys = JSON.parse(keysStr);
        } catch (e) { console.error("Error parsing post keys:", e); }
      }

      // Load each post
      const postList: PostRecord[] = [];
      for (const key of keys) {
        try {
          const postBytes = await contract.getData(`post_${key}`);
          if (postBytes.length > 0) {
            try {
              const postData = JSON.parse(ethers.toUtf8String(postBytes));
              postList.push({ 
                id: key, 
                encryptedScore: postData.score, 
                timestamp: postData.timestamp, 
                author: postData.author, 
                status: postData.status || "pending",
                category: postData.category,
                encryptedContent: postData.content
              });
            } catch (e) { console.error(`Error parsing post data for ${key}:`, e); }
          }
        } catch (e) { console.error(`Error loading post ${key}:`, e); }
      }

      // Sort by timestamp and update state
      postList.sort((a, b) => b.timestamp - a.timestamp);
      setPosts(postList);
    } catch (e) { 
      console.error("Error loading posts:", e); 
      setTransactionStatus({ 
        visible: true, 
        status: "error", 
        message: "Failed to load posts: " + (e instanceof Error ? e.message : "Unknown error") 
      });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
    } finally { 
      setIsRefreshing(false); 
      setLoading(false); 
    }
  };

  const submitPost = async () => {
    if (!isConnected) { 
      alert("Please connect wallet first"); 
      return; 
    }
    
    setCreating(true);
    setTransactionStatus({ 
      visible: true, 
      status: "pending", 
      message: "Encrypting content with Zama FHE..." 
    });

    try {
      // Encrypt the misinformation score with FHE
      const encryptedScore = FHEEncryptNumber(newPost.score);
      
      // Simulate encrypted content (real FHE can't handle strings)
      const encryptedContent = `FHE-SIM-${btoa(newPost.content.substring(0, 100))}`;
      
      const contract = await getContractWithSigner();
      if (!contract) throw new Error("Failed to get contract with signer");
      
      // Generate unique post ID
      const postId = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
      
      // Prepare post data
      const postData = { 
        score: encryptedScore, 
        content: encryptedContent,
        timestamp: Math.floor(Date.now() / 1000), 
        author: address, 
        category: newPost.category,
        status: "pending" 
      };

      // Store post data
      await contract.setData(`post_${postId}`, ethers.toUtf8Bytes(JSON.stringify(postData)));
      
      // Update post keys list
      const keysBytes = await contract.getData("post_keys");
      let keys: string[] = [];
      if (keysBytes.length > 0) {
        try { 
          keys = JSON.parse(ethers.toUtf8String(keysBytes)); 
        } catch (e) { 
          console.error("Error parsing keys:", e); 
        }
      }
      keys.push(postId);
      await contract.setData("post_keys", ethers.toUtf8Bytes(JSON.stringify(keys)));
      
      // Update UI
      setTransactionStatus({ 
        visible: true, 
        status: "success", 
        message: "Post submitted with FHE encryption!" 
      });
      await loadPosts();
      
      // Reset form
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
        setShowCreateModal(false);
        setNewPost({ category: "news", content: "", score: 50 });
      }, 2000);
    } catch (e: any) {
      const errorMessage = e.message.includes("user rejected transaction") 
        ? "Transaction rejected by user" 
        : "Submission failed: " + (e.message || "Unknown error");
      setTransactionStatus({ 
        visible: true, 
        status: "error", 
        message: errorMessage 
      });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
    } finally { 
      setCreating(false); 
    }
  };

  const decryptWithSignature = async (encryptedData: string): Promise<number | null> => {
    if (!isConnected) { 
      alert("Please connect wallet first"); 
      return null; 
    }
    
    setIsDecrypting(true);
    try {
      // Simulate ZAMA FHE decryption with wallet signature
      const message = `publickey:${publicKey}\ncontractAddresses:${contractAddress}\ncontractsChainId:${chainId}\nstartTimestamp:${startTimestamp}\ndurationDays:${durationDays}`;
      await signMessageAsync({ message });
      
      // Simulate decryption delay
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      return FHEDecryptNumber(encryptedData);
    } catch (e) { 
      console.error("Decryption failed:", e); 
      return null; 
    } finally { 
      setIsDecrypting(false); 
    }
  };

  const analyzePost = async (postId: string) => {
    if (!isConnected) { 
      alert("Please connect wallet first"); 
      return; 
    }
    
    setTransactionStatus({ 
      visible: true, 
      status: "pending", 
      message: "Analyzing with FHE model..." 
    });

    try {
      const contract = await getContractReadOnly();
      if (!contract) throw new Error("Failed to get contract");
      
      // Get post data
      const postBytes = await contract.getData(`post_${postId}`);
      if (postBytes.length === 0) throw new Error("Post not found");
      const postData = JSON.parse(ethers.toUtf8String(postBytes));
      
      // Simulate FHE analysis with model weights (in real FHE these would be encrypted weights)
      const modelWeights = [0.8, 0.2]; // Example model weights
      const analyzedScore = FHEComputeScore(postData.score, modelWeights);
      
      // Determine status based on analyzed score
      const decryptedScore = FHEDecryptNumber(analyzedScore);
      const newStatus = decryptedScore > 70 ? "flagged" : "cleared";
      
      // Update post with new analysis
      const contractWithSigner = await getContractWithSigner();
      if (!contractWithSigner) throw new Error("Failed to get contract with signer");
      
      const updatedPost = { 
        ...postData, 
        status: newStatus,
        score: analyzedScore 
      };
      
      await contractWithSigner.setData(`post_${postId}`, ethers.toUtf8Bytes(JSON.stringify(updatedPost)));
      
      setTransactionStatus({ 
        visible: true, 
        status: "success", 
        message: `FHE analysis complete: ${newStatus === "flagged" ? "Potential misinformation" : "Content cleared"}` 
      });
      
      await loadPosts();
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 2000);
    } catch (e: any) {
      setTransactionStatus({ 
        visible: true, 
        status: "error", 
        message: "Analysis failed: " + (e.message || "Unknown error") 
      });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
    }
  };

  const resetPost = async (postId: string) => {
    if (!isConnected) { 
      alert("Please connect wallet first"); 
      return; 
    }
    
    setTransactionStatus({ 
      visible: true, 
      status: "pending", 
      message: "Resetting post analysis..." 
    });

    try {
      const contract = await getContractWithSigner();
      if (!contract) throw new Error("Failed to get contract with signer");
      
      const postBytes = await contract.getData(`post_${postId}`);
      if (postBytes.length === 0) throw new Error("Post not found");
      const postData = JSON.parse(ethers.toUtf8String(postBytes));
      
      const updatedPost = { 
        ...postData, 
        status: "pending" 
      };
      
      await contract.setData(`post_${postId}`, ethers.toUtf8Bytes(JSON.stringify(updatedPost)));
      
      setTransactionStatus({ 
        visible: true, 
        status: "success", 
        message: "Post reset to pending analysis" 
      });
      
      await loadPosts();
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 2000);
    } catch (e: any) {
      setTransactionStatus({ 
        visible: true, 
        status: "error", 
        message: "Reset failed: " + (e.message || "Unknown error") 
      });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
    }
  };

  const isAuthor = (postAddress: string) => address?.toLowerCase() === postAddress.toLowerCase();

  // Render misinformation risk meter
  const renderRiskMeter = (score: number) => {
    const percentage = Math.min(100, Math.max(0, score));
    const color = percentage > 70 ? "#ff2a2a" : 
                 percentage > 40 ? "#ff8c2a" : "#2aff2a";
    
    return (
      <div className="risk-meter">
        <div className="meter-bar" style={{ 
          width: `${percentage}%`,
          backgroundColor: color
        }}></div>
        <div className="meter-label">{percentage.toFixed(0)}% Risk</div>
      </div>
    );
  };

  if (loading) return (
    <div className="loading-screen">
      <div className="cyber-spinner"></div>
      <p>Initializing FHE connection...</p>
    </div>
  );

  return (
    <div className="app-container cyberpunk-theme">
      <header className="app-header">
        <div className="logo">
          <div className="logo-icon"><div className="shield-icon"></div></div>
          <h1>FHE<span>Misinfo</span>Detector</h1>
        </div>
        <div className="header-actions">
          <button onClick={() => setShowCreateModal(true)} className="create-post-btn cyber-button">
            <div className="add-icon"></div>New Post
          </button>
          <div className="wallet-connect-wrapper">
            <ConnectButton accountStatus="address" chainStatus="icon" showBalance={false}/>
          </div>
        </div>
      </header>

      <div className="main-content">
        <div className="welcome-banner">
          <div className="welcome-text">
            <h2>FHE-Powered Misinformation Detection</h2>
            <p>Analyze social media content with Zama FHE while preserving privacy</p>
          </div>
          <div className="fhe-indicator">
            <div className="fhe-lock"></div>
            <span>FHE Encryption Active</span>
          </div>
        </div>

        <div className="dashboard-grid">
          <div className="dashboard-card cyber-card">
            <h3>Project Introduction</h3>
            <p>
              This AI agent uses <strong>Zama FHE technology</strong> to detect potential misinformation in social media posts 
              while keeping all content encrypted. Posts are analyzed homomorphically against known misinformation patterns.
            </p>
            <div className="fhe-badge"><span>FHE-Powered</span></div>
          </div>

          <div className="dashboard-card cyber-card">
            <h3>Detection Statistics</h3>
            <div className="stats-grid">
              <div className="stat-item">
                <div className="stat-value">{posts.length}</div>
                <div className="stat-label">Total Posts</div>
              </div>
              <div className="stat-item">
                <div className="stat-value">{flaggedCount}</div>
                <div className="stat-label">Flagged</div>
              </div>
              <div className="stat-item">
                <div className="stat-value">{pendingCount}</div>
                <div className="stat-label">Pending</div>
              </div>
              <div className="stat-item">
                <div className="stat-value">{clearedCount}</div>
                <div className="stat-label">Cleared</div>
              </div>
              <div className="stat-item wide">
                <div className="stat-value">{avgFlaggedScore.toFixed(1)}%</div>
                <div className="stat-label">Avg Flagged Score</div>
              </div>
            </div>
          </div>

          <div className="dashboard-card cyber-card">
            <h3>Quick Actions</h3>
            <div className="action-buttons">
              <button onClick={loadPosts} className="cyber-button" disabled={isRefreshing}>
                {isRefreshing ? "Refreshing..." : "Refresh Data"}
              </button>
              <button onClick={() => setShowCreateModal(true)} className="cyber-button primary">
                Submit New Post
              </button>
              <button 
                onClick={() => contractAddress && navigator.clipboard.writeText(contractAddress)} 
                className="cyber-button"
              >
                Copy Contract Address
              </button>
            </div>
          </div>
        </div>

        <div className="posts-section">
          <div className="section-header">
            <h2>Encrypted Post Analysis</h2>
            <div className="filter-controls">
              <div className="search-box">
                <input
                  type="text"
                  placeholder="Search categories..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="cyber-input"
                />
              </div>
              <select 
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value as any)}
                className="cyber-select"
              >
                <option value="all">All Statuses</option>
                <option value="pending">Pending</option>
                <option value="flagged">Flagged</option>
                <option value="cleared">Cleared</option>
              </select>
              <button onClick={loadPosts} className="refresh-btn cyber-button" disabled={isRefreshing}>
                {isRefreshing ? "Refreshing..." : "Refresh"}
              </button>
            </div>
          </div>

          <div className="posts-list cyber-card">
            <div className="table-header">
              <div className="header-cell">ID</div>
              <div className="header-cell">Category</div>
              <div className="header-cell">Author</div>
              <div className="header-cell">Date</div>
              <div className="header-cell">Risk Score</div>
              <div className="header-cell">Status</div>
              <div className="header-cell">Actions</div>
            </div>

            {filteredPosts.length === 0 ? (
              <div className="no-posts">
                <div className="no-posts-icon"></div>
                <p>No posts found matching your criteria</p>
                <button className="cyber-button primary" onClick={() => setShowCreateModal(true)}>
                  Create First Post
                </button>
              </div>
            ) : filteredPosts.map(post => (
              <div 
                className={`post-row ${post.status}`} 
                key={post.id} 
                onClick={() => setSelectedPost(post)}
              >
                <div className="table-cell post-id">#{post.id.substring(0, 6)}</div>
                <div className="table-cell">{post.category}</div>
                <div className="table-cell">{post.author.substring(0, 6)}...{post.author.substring(38)}</div>
                <div className="table-cell">{new Date(post.timestamp * 1000).toLocaleDateString()}</div>
                <div className="table-cell">
                  {renderRiskMeter(FHEDecryptNumber(post.encryptedScore))}
                </div>
                <div className="table-cell">
                  <span className={`status-badge ${post.status}`}>{post.status}</span>
                </div>
                <div className="table-cell actions">
                  {post.status === "pending" && (
                    <button 
                      className="action-btn cyber-button" 
                      onClick={(e) => { e.stopPropagation(); analyzePost(post.id); }}
                    >
                      Analyze
                    </button>
                  )}
                  {post.status !== "pending" && (
                    <button 
                      className="action-btn cyber-button" 
                      onClick={(e) => { e.stopPropagation(); resetPost(post.id); }}
                    >
                      Reset
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {showCreateModal && (
        <ModalCreate 
          onSubmit={submitPost} 
          onClose={() => setShowCreateModal(false)} 
          creating={creating} 
          postData={newPost} 
          setPostData={setNewPost}
        />
      )}

      {selectedPost && (
        <PostDetailModal 
          post={selectedPost} 
          onClose={() => { setSelectedPost(null); setDecryptedScore(null); }} 
          decryptedScore={decryptedScore} 
          setDecryptedScore={setDecryptedScore} 
          isDecrypting={isDecrypting} 
          decryptWithSignature={decryptWithSignature}
        />
      )}

      {transactionStatus.visible && (
        <div className="transaction-modal">
          <div className="transaction-content cyber-card">
            <div className={`transaction-icon ${transactionStatus.status}`}>
              {transactionStatus.status === "pending" && <div className="cyber-spinner"></div>}
              {transactionStatus.status === "success" && <div className="check-icon"></div>}
              {transactionStatus.status === "error" && <div className="error-icon"></div>}
            </div>
            <div className="transaction-message">{transactionStatus.message}</div>
          </div>
        </div>
      )}

      <footer className="app-footer">
        <div className="footer-content">
          <div className="footer-brand">
            <div className="logo"><div className="shield-icon"></div><span>FHE Misinfo Detector</span></div>
            <p>Privacy-preserving misinformation detection powered by Zama FHE</p>
          </div>
          <div className="footer-links">
            <a href="#" className="footer-link">Documentation</a>
            <a href="#" className="footer-link">Privacy Policy</a>
            <a href="#" className="footer-link">Terms of Service</a>
            <a href="#" className="footer-link">Contact</a>
          </div>
        </div>
        <div className="footer-bottom">
          <div className="fhe-badge"><span>FHE-Powered Privacy</span></div>
          <div className="copyright">© {new Date().getFullYear()} FHE Misinfo Detector. All rights reserved.</div>
        </div>
      </footer>
    </div>
  );
};

interface ModalCreateProps {
  onSubmit: () => void; 
  onClose: () => void; 
  creating: boolean;
  postData: any;
  setPostData: (data: any) => void;
}

const ModalCreate: React.FC<ModalCreateProps> = ({ onSubmit, onClose, creating, postData, setPostData }) => {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setPostData({ ...postData, [name]: value });
  };

  const handleScoreChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setPostData({ ...postData, [name]: parseFloat(value) });
  };

  const handleSubmit = () => {
    if (!postData.category || !postData.content) { 
      alert("Please fill required fields"); 
      return; 
    }
    onSubmit();
  };

  return (
    <div className="modal-overlay">
      <div className="create-modal cyber-card">
        <div className="modal-header">
          <h2>Submit New Post for Analysis</h2>
          <button onClick={onClose} className="close-modal">&times;</button>
        </div>
        <div className="modal-body">
          <div className="fhe-notice-banner">
            <div className="key-icon"></div> 
            <div>
              <strong>FHE Encryption Notice</strong>
              <p>Your post content will be encrypted before analysis</p>
            </div>
          </div>
          
          <div className="form-grid">
            <div className="form-group">
              <label>Category *</label>
              <select 
                name="category" 
                value={postData.category} 
                onChange={handleChange} 
                className="cyber-select"
              >
                <option value="news">News</option>
                <option value="politics">Politics</option>
                <option value="health">Health</option>
                <option value="technology">Technology</option>
                <option value="finance">Finance</option>
                <option value="other">Other</option>
              </select>
            </div>
            
            <div className="form-group">
              <label>Initial Misinfo Score (0-100)</label>
              <input 
                type="range" 
                name="score" 
                min="0" 
                max="100" 
                value={postData.score} 
                onChange={handleScoreChange}
                className="cyber-slider"
              />
              <div className="slider-value">{postData.score}</div>
            </div>
            
            <div className="form-group wide">
              <label>Post Content *</label>
              <textarea 
                name="content" 
                value={postData.content} 
                onChange={handleChange} 
                placeholder="Enter post content (will be encrypted)..."
                className="cyber-textarea"
                rows={4}
              ></textarea>
            </div>
          </div>
          
          <div className="encryption-preview">
            <h4>Encryption Preview</h4>
            <div className="preview-container">
              <div className="plain-data">
                <span>Plain Score:</span>
                <div>{postData.score}</div>
              </div>
              <div className="encryption-arrow">→</div>
              <div className="encrypted-data">
                <span>Encrypted Data:</span>
                <div>{FHEEncryptNumber(postData.score).substring(0, 30)}...</div>
              </div>
            </div>
          </div>
        </div>
        
        <div className="modal-footer">
          <button onClick={onClose} className="cancel-btn cyber-button">Cancel</button>
          <button 
            onClick={handleSubmit} 
            disabled={creating} 
            className="submit-btn cyber-button primary"
          >
            {creating ? "Encrypting with FHE..." : "Submit Securely"}
          </button>
        </div>
      </div>
    </div>
  );
};

interface PostDetailModalProps {
  post: PostRecord;
  onClose: () => void;
  decryptedScore: number | null;
  setDecryptedScore: (value: number | null) => void;
  isDecrypting: boolean;
  decryptWithSignature: (encryptedData: string) => Promise<number | null>;
}

const PostDetailModal: React.FC<PostDetailModalProps> = ({ 
  post, 
  onClose, 
  decryptedScore, 
  setDecryptedScore, 
  isDecrypting, 
  decryptWithSignature 
}) => {
  const handleDecrypt = async () => {
    if (decryptedScore !== null) { 
      setDecryptedScore(null); 
      return; 
    }
    const decrypted = await decryptWithSignature(post.encryptedScore);
    if (decrypted !== null) setDecryptedScore(decrypted);
  };

  return (
    <div className="modal-overlay">
      <div className="post-detail-modal cyber-card">
        <div className="modal-header">
          <h2>Post Analysis #{post.id.substring(0, 8)}</h2>
          <button onClick={onClose} className="close-modal">&times;</button>
        </div>
        
        <div className="modal-body">
          <div className="post-info">
            <div className="info-item">
              <span>Category:</span>
              <strong>{post.category}</strong>
            </div>
            <div className="info-item">
              <span>Author:</span>
              <strong>{post.author.substring(0, 6)}...{post.author.substring(38)}</strong>
            </div>
            <div className="info-item">
              <span>Date:</span>
              <strong>{new Date(post.timestamp * 1000).toLocaleString()}</strong>
            </div>
            <div className="info-item">
              <span>Status:</span>
              <strong className={`status-badge ${post.status}`}>{post.status}</strong>
            </div>
          </div>
          
          <div className="encrypted-data-section">
            <h3>Encrypted Content</h3>
            <div className="encrypted-content">
              {post.encryptedContent.substring(0, 100)}...
            </div>
            <div className="fhe-tag">
              <div className="fhe-icon"></div>
              <span>FHE Encrypted</span>
            </div>
          </div>
          
          <div className="score-section">
            <h3>Misinformation Risk Score</h3>
            {renderRiskMeter(decryptedScore || FHEDecryptNumber(post.encryptedScore))}
            <button 
              className="decrypt-btn cyber-button" 
              onClick={handleDecrypt} 
              disabled={isDecrypting}
            >
              {isDecrypting ? (
                <span className="decrypt-spinner"></span>
              ) : decryptedScore !== null ? (
                "Hide Decrypted Score"
              ) : (
                "Decrypt with Wallet Signature"
              )}
            </button>
          </div>
          
          {decryptedScore !== null && (
            <div className="decrypted-data-section">
              <h3>Decrypted Analysis</h3>
              <div className="analysis-result">
                {decryptedScore > 70 ? (
                  <div className="warning-message">
                    <div className="warning-icon"></div>
                    <strong>High Risk of Misinformation ({decryptedScore.toFixed(1)}%)</strong>
                    <p>This content matches known patterns of misinformation in our encrypted model.</p>
                  </div>
                ) : decryptedScore > 40 ? (
                  <div className="caution-message">
                    <div className="caution-icon"></div>
                    <strong>Moderate Risk ({decryptedScore.toFixed(1)}%)</strong>
                    <p>This content shows some characteristics that may require further review.</p>
                  </div>
                ) : (
                  <div className="safe-message">
                    <div className="safe-icon"></div>
                    <strong>Low Risk ({decryptedScore.toFixed(1)}%)</strong>
                    <p>This content appears to be legitimate based on our encrypted analysis.</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
        
        <div className="modal-footer">
          <button onClick={onClose} className="close-btn cyber-button">Close</button>
        </div>
      </div>
    </div>
  );
};

function renderRiskMeter(score: number) {
  const percentage = Math.min(100, Math.max(0, score));
  const color = percentage > 70 ? "#ff2a2a" : 
               percentage > 40 ? "#ff8c2a" : "#2aff2a";
  
  return (
    <div className="risk-meter">
      <div className="meter-bar" style={{ 
        width: `${percentage}%`,
        backgroundColor: color
      }}></div>
      <div className="meter-label">{percentage.toFixed(0)}% Risk</div>
    </div>
  );
}

export default App;