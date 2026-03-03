// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title BTNToken
 * @dev BitTON token with 6 decimals, multi-minter system, EIP-2612 permit, and supply tracking
 */
contract BTNToken is ERC20, ERC20Permit, Ownable {
    uint256 public constant MAX_SUPPLY = 21_000_000 * 10**6; // 21M with 6 decimals
    
    uint256 public issuedSupply; // Total minted
    uint256 public burnedSupply; // Total burned
    bool public mintingActive = true; // Minting enabled by default
    
    mapping(address => bool) private _minters;
    
    event MinterAdded(address indexed minter);
    event MinterRemoved(address indexed minter);
    event MintingStatusChanged(bool active);
    event TokensMinted(address indexed to, uint256 amount);
    event TokensBurned(address indexed from, uint256 amount);
    
    modifier onlyMinter() {
        require(_minters[msg.sender] || msg.sender == owner(), "BTNToken: caller is not a minter");
        _;
    }
    
    modifier whenMintingActive() {
        require(mintingActive, "BTNToken: minting is not active");
        _;
    }
    
    constructor() ERC20("BTN", "BTN") ERC20Permit("BTN") Ownable(msg.sender) {
        // Mint initial supply to deployer
        _mint(msg.sender, MAX_SUPPLY);
        issuedSupply = MAX_SUPPLY;
        
        // Owner is automatically a minter
        _minters[msg.sender] = true;
        emit MinterAdded(msg.sender);
    }
    
    /**
     * @dev Returns 6 decimals as per requirements
     */
    function decimals() public pure override returns (uint8) {
        return 6;
    }
    
    /**
     * @dev Check if an address is a minter
     */
    function isMinter(address account) public view returns (bool) {
        return _minters[account];
    }
    
    /**
     * @dev Add a new minter (only owner)
     */
    function addMinter(address minter) external onlyOwner {
        require(minter != address(0), "BTNToken: zero address");
        require(!_minters[minter], "BTNToken: already a minter");
        
        _minters[minter] = true;
        emit MinterAdded(minter);
    }
    
    /**
     * @dev Remove a minter (only owner)
     */
    function removeMinter(address minter) external onlyOwner {
        require(_minters[minter], "BTNToken: not a minter");
        
        _minters[minter] = false;
        emit MinterRemoved(minter);
    }
    
    /**
     * @dev Caller renounces their minting rights
     */
    function renounceMinting() external {
        require(_minters[msg.sender], "BTNToken: caller is not a minter");
        
        _minters[msg.sender] = false;
        emit MinterRemoved(msg.sender);
    }
    
    /**
     * @dev Toggle minting on/off (only owner)
     */
    function setMintingActive(bool active) external onlyOwner {
        mintingActive = active;
        emit MintingStatusChanged(active);
    }
    
    /**
     * @dev Mint new tokens (only minters, respects MAX_SUPPLY)
     */
    function mint(address to, uint256 amount) external onlyMinter whenMintingActive {
        require(to != address(0), "BTNToken: mint to zero address");
        require(totalSupply() + amount <= MAX_SUPPLY, "BTNToken: exceeds max supply");
        
        _mint(to, amount);
        issuedSupply += amount;
        
        emit TokensMinted(to, amount);
    }
    
    /**
     * @dev Burn tokens from caller's balance
     */
    function burn(uint256 amount) external {
        _burn(msg.sender, amount);
        burnedSupply += amount;
        
        emit TokensBurned(msg.sender, amount);
    }
    
    /**
     * @dev Increase allowance (ERC20 enhancement)
     */
    function increaseAllowance(address spender, uint256 addedValue) public returns (bool) {
        address owner = _msgSender();
        _approve(owner, spender, allowance(owner, spender) + addedValue);
        return true;
    }
    
    /**
     * @dev Decrease allowance (ERC20 enhancement)
     */
    function decreaseAllowance(address spender, uint256 subtractedValue) public returns (bool) {
        address owner = _msgSender();
        uint256 currentAllowance = allowance(owner, spender);
        require(currentAllowance >= subtractedValue, "BTNToken: decreased allowance below zero");
        unchecked {
            _approve(owner, spender, currentAllowance - subtractedValue);
        }
        return true;
    }
}
